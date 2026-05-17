import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { db } from '../../config/database.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { mcpJwtSecret, MCP_AUTH_CODE_TTL_SECONDS } from '../config.js';

/**
 * OAuth 2.1 authorization endpoint with PKCE.
 *
 * Flow:
 *   1. MCP client redirects user here with client_id + code_challenge + ...
 *   2. We validate the client + redirect_uri, then bounce to Google.
 *   3. We pass our entire request state through Google's `state` param,
 *      signed as a JWT so it can't be tampered with on the round-trip.
 *   4. Google returns to /oauth/google/callback with code + state.
 *   5. We exchange Google's code for an ID token, look up the email in
 *      api_users, then mint our own authorization_code and redirect back
 *      to the MCP client's redirect_uri.
 */

const authorizeQuerySchema = z.object({
  response_type: z.literal('code'),
  client_id: z.string().uuid(),
  redirect_uri: z.string().url(),
  code_challenge: z.string().min(43).max(128),
  code_challenge_method: z.enum(['S256']).default('S256'),
  state: z.string().optional(),
  scope: z.string().optional(),
});

const GOOGLE_CALLBACK_PATH = '/mcp/oauth/google/callback';

interface MCPState {
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  client_state?: string;
  scope: string;
}

function buildGoogleCallbackUrl(req: Request): string {
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host');
  return `${proto}://${host}${GOOGLE_CALLBACK_PATH}`;
}

function renderError(res: Response, status: number, title: string, message: string): void {
  res.status(status).type('html').send(`
    <!doctype html>
    <html dir="rtl" lang="he">
      <head><meta charset="utf-8"><title>${title}</title></head>
      <body style="font-family:sans-serif;max-width:560px;margin:80px auto;padding:0 20px;text-align:center;">
        <h1>${title}</h1>
        <p>${message}</p>
      </body>
    </html>
  `);
}

export async function authorize(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = authorizeQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      renderError(res, 400, 'בקשה לא תקינה', `פרמטרי OAuth חסרים או שגויים: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`);
      return;
    }
    const q = parsed.data;

    const client = await db('mcp_oauth_clients').where({ client_id: q.client_id }).first();
    if (!client) {
      renderError(res, 400, 'לקוח לא רשום', 'ה-MCP client לא רשום במערכת. יש לבצע registration קודם.');
      return;
    }

    const allowedRedirects: string[] = Array.isArray(client.redirect_uris)
      ? client.redirect_uris
      : JSON.parse(client.redirect_uris ?? '[]');
    if (!allowedRedirects.includes(q.redirect_uri)) {
      renderError(res, 400, 'redirect_uri לא מאושר', 'ה-redirect URI לא תואם למה שנרשם ע"י ה-client.');
      return;
    }

    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      renderError(res, 503, 'הזדהות לא זמינה', 'Google OAuth לא מוגדר בשרת.');
      return;
    }

    const mcpState: MCPState = {
      client_id: q.client_id,
      redirect_uri: q.redirect_uri,
      code_challenge: q.code_challenge,
      code_challenge_method: q.code_challenge_method,
      client_state: q.state,
      scope: q.scope ?? 'mcp',
    };
    const signedState = jwt.sign(mcpState, mcpJwtSecret, { expiresIn: '15m' });

    const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, buildGoogleCallbackUrl(req));
    const url = googleClient.generateAuthUrl({
      access_type: 'online',
      scope: ['openid', 'email', 'profile'],
      prompt: 'select_account',
      state: signedState,
    });
    res.redirect(url);
  } catch (err) {
    next(err);
  }
}

export async function googleCallback(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const code = req.query.code as string | undefined;
    const state = req.query.state as string | undefined;
    if (!code || !state) {
      renderError(res, 400, 'תגובה חלקית', 'חסר code או state בתגובה מ-Google.');
      return;
    }

    let mcpState: MCPState;
    try {
      mcpState = jwt.verify(state, mcpJwtSecret) as MCPState;
    } catch {
      renderError(res, 400, 'state לא תקין', 'ה-state שחזר מ-Google לא תקף או פג תוקפו. יש לנסות להתחבר מחדש.');
      return;
    }

    const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, buildGoogleCallbackUrl(req));
    const { tokens } = await googleClient.getToken(code);
    googleClient.setCredentials(tokens);

    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token!,
      audience: env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload()!;
    const email = payload.email!;
    const googleId = payload.sub;
    const name = payload.name ?? email;

    let apiUser = await db('api_users').where({ email }).first();
    if (!apiUser) {
      logger.warn({ email }, 'MCP OAuth: email not in api_users — invitation required');
      renderError(res, 403, 'אין הרשאה ל-MCP',
        `הכתובת <strong>${email}</strong> לא מוזמנת ל-MCP API של Ocal. ניתן לפנות למנהל המערכת לקבלת הזמנה.`);
      return;
    }
    if (!apiUser.is_active) {
      renderError(res, 403, 'חשבון מושבת', 'החשבון שלך מושבת. לפנות למנהל המערכת.');
      return;
    }

    await db('api_users').where({ id: apiUser.id }).update({
      google_id: googleId,
      name,
      last_seen_at: new Date(),
      updated_at: new Date(),
    });

    const authorizationCode = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + MCP_AUTH_CODE_TTL_SECONDS * 1000);
    await db('mcp_oauth_codes').insert({
      code: authorizationCode,
      client_id: mcpState.client_id,
      api_user_id: apiUser.id,
      redirect_uri: mcpState.redirect_uri,
      code_challenge: mcpState.code_challenge,
      code_challenge_method: mcpState.code_challenge_method,
      scope: mcpState.scope,
      expires_at: expiresAt,
    });

    const redirect = new URL(mcpState.redirect_uri);
    redirect.searchParams.set('code', authorizationCode);
    if (mcpState.client_state) redirect.searchParams.set('state', mcpState.client_state);

    logger.info({ email, clientId: mcpState.client_id, apiUserId: apiUser.id }, 'MCP authorization code issued');
    res.redirect(redirect.toString());
  } catch (err) {
    logger.error({ err }, 'MCP Google callback failed');
    next(err);
  }
}

export { buildGoogleCallbackUrl };
