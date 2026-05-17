import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { db } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { mcpJwtSecret, MCP_JWT_AUDIENCE, MCP_ACCESS_TOKEN_TTL_SECONDS, mcpUrl } from '../config.js';

/**
 * OAuth 2.1 token endpoint. Supports authorization_code (PKCE-protected) and
 * refresh_token grants. Access tokens are JWTs signed with JWT_SECRET and
 * audience = MCP_JWT_AUDIENCE so they can never be confused with the admin UI
 * cookie token (which has no aud claim).
 */

const tokenBodySchema = z.discriminatedUnion('grant_type', [
  z.object({
    grant_type: z.literal('authorization_code'),
    code: z.string(),
    redirect_uri: z.string().url(),
    client_id: z.string().uuid(),
    code_verifier: z.string().min(43).max(128),
    client_secret: z.string().optional(),
  }),
  z.object({
    grant_type: z.literal('refresh_token'),
    refresh_token: z.string(),
    client_id: z.string().uuid(),
    client_secret: z.string().optional(),
  }),
]);

function s256(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

function oauthError(res: Response, status: number, code: string, description: string): void {
  res.status(status).json({ error: code, error_description: description });
}

async function verifyClient(clientId: string, providedSecret: string | undefined): Promise<{ ok: boolean; reason?: string }> {
  const client = await db('mcp_oauth_clients').where({ client_id: clientId }).first();
  if (!client) return { ok: false, reason: 'unknown client_id' };
  if (client.token_endpoint_auth_method === 'none') return { ok: true };
  if (!providedSecret) return { ok: false, reason: 'client_secret required' };
  const hash = crypto.createHash('sha256').update(providedSecret).digest('hex');
  if (hash !== client.client_secret_hash) return { ok: false, reason: 'invalid client_secret' };
  return { ok: true };
}

function signAccessToken(req: Request, apiUserId: string, clientId: string): string {
  return jwt.sign(
    {
      sub: apiUserId,
      cid: clientId,
      scope: 'mcp',
    },
    mcpJwtSecret,
    {
      audience: MCP_JWT_AUDIENCE,
      issuer: mcpUrl(req),
      expiresIn: MCP_ACCESS_TOKEN_TTL_SECONDS,
    },
  );
}

function signRefreshToken(req: Request, apiUserId: string, clientId: string): string {
  return jwt.sign(
    {
      sub: apiUserId,
      cid: clientId,
      typ: 'refresh',
    },
    mcpJwtSecret,
    {
      audience: MCP_JWT_AUDIENCE,
      issuer: mcpUrl(req),
      expiresIn: 30 * 24 * 60 * 60,
    },
  );
}

export async function token(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = tokenBodySchema.safeParse(req.body);
    if (!parsed.success) {
      oauthError(res, 400, 'invalid_request', parsed.error.message);
      return;
    }
    const body = parsed.data;

    const clientCheck = await verifyClient(body.client_id, body.client_secret);
    if (!clientCheck.ok) {
      oauthError(res, 401, 'invalid_client', clientCheck.reason ?? 'client authentication failed');
      return;
    }

    if (body.grant_type === 'authorization_code') {
      const row = await db('mcp_oauth_codes').where({ code: body.code }).first();
      if (!row) {
        oauthError(res, 400, 'invalid_grant', 'authorization code not found');
        return;
      }
      // Single-use: delete immediately (regardless of validation outcome below)
      await db('mcp_oauth_codes').where({ code: body.code }).del();

      if (new Date(row.expires_at).getTime() < Date.now()) {
        oauthError(res, 400, 'invalid_grant', 'authorization code expired');
        return;
      }
      if (row.client_id !== body.client_id) {
        oauthError(res, 400, 'invalid_grant', 'code was issued to a different client');
        return;
      }
      if (row.redirect_uri !== body.redirect_uri) {
        oauthError(res, 400, 'invalid_grant', 'redirect_uri mismatch');
        return;
      }
      const expectedChallenge = row.code_challenge;
      const actualChallenge = s256(body.code_verifier);
      if (actualChallenge !== expectedChallenge) {
        oauthError(res, 400, 'invalid_grant', 'PKCE verification failed');
        return;
      }

      const accessToken = signAccessToken(req, row.api_user_id, row.client_id);
      const refreshToken = signRefreshToken(req, row.api_user_id, row.client_id);

      logger.info({ apiUserId: row.api_user_id, clientId: row.client_id }, 'MCP access token issued');
      res.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: MCP_ACCESS_TOKEN_TTL_SECONDS,
        refresh_token: refreshToken,
        scope: row.scope ?? 'mcp',
      });
      return;
    }

    // grant_type === 'refresh_token'
    let refreshPayload: { sub: string; cid: string; typ?: string };
    try {
      refreshPayload = jwt.verify(body.refresh_token, mcpJwtSecret, {
        audience: MCP_JWT_AUDIENCE,
      }) as { sub: string; cid: string; typ?: string };
    } catch {
      oauthError(res, 400, 'invalid_grant', 'refresh token invalid or expired');
      return;
    }
    if (refreshPayload.typ !== 'refresh') {
      oauthError(res, 400, 'invalid_grant', 'token is not a refresh token');
      return;
    }
    if (refreshPayload.cid !== body.client_id) {
      oauthError(res, 400, 'invalid_grant', 'refresh token bound to a different client');
      return;
    }

    const user = await db('api_users').where({ id: refreshPayload.sub, is_active: true }).first();
    if (!user) {
      oauthError(res, 400, 'invalid_grant', 'user no longer active');
      return;
    }

    const accessToken = signAccessToken(req, refreshPayload.sub, refreshPayload.cid);
    const newRefresh = signRefreshToken(req, refreshPayload.sub, refreshPayload.cid);
    res.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: MCP_ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: newRefresh,
      scope: 'mcp',
    });
  } catch (err) {
    next(err);
  }
}
