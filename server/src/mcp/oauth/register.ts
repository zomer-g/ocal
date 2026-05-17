import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { db } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

/**
 * RFC 7591 — Dynamic Client Registration.
 *
 * MCP clients (Claude.ai connector, MCP Inspector, etc.) POST here to claim
 * a client_id before starting the OAuth flow. We default to public clients
 * (no secret) so PKCE is the only thing protecting the authorization code.
 */

const registrationSchema = z.object({
  client_name: z.string().min(1).max(200),
  redirect_uris: z.array(z.string().url()).min(1).max(10),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  token_endpoint_auth_method: z.enum(['none', 'client_secret_post']).optional(),
  scope: z.string().optional(),
});

export async function registerClient(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = registrationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_client_metadata', error_description: parsed.error.message });
      return;
    }

    const body = parsed.data;
    const isPublic = (body.token_endpoint_auth_method ?? 'none') === 'none';

    let plainSecret: string | null = null;
    let secretHash: string | null = null;
    if (!isPublic) {
      plainSecret = crypto.randomBytes(32).toString('base64url');
      secretHash = crypto.createHash('sha256').update(plainSecret).digest('hex');
    }

    const [row] = await db('mcp_oauth_clients')
      .insert({
        client_name: body.client_name,
        redirect_uris: JSON.stringify(body.redirect_uris),
        grant_types: JSON.stringify(body.grant_types ?? ['authorization_code', 'refresh_token']),
        response_types: JSON.stringify(body.response_types ?? ['code']),
        token_endpoint_auth_method: body.token_endpoint_auth_method ?? 'none',
        scope: body.scope ?? 'mcp',
        client_secret_hash: secretHash,
      })
      .returning(['client_id', 'client_name', 'redirect_uris', 'grant_types', 'response_types', 'token_endpoint_auth_method', 'scope', 'created_at']);

    logger.info({ clientId: row.client_id, name: row.client_name }, 'MCP OAuth client registered');

    res.status(201).json({
      client_id: row.client_id,
      ...(plainSecret ? { client_secret: plainSecret } : {}),
      client_name: row.client_name,
      redirect_uris: row.redirect_uris,
      grant_types: row.grant_types,
      response_types: row.response_types,
      token_endpoint_auth_method: row.token_endpoint_auth_method,
      scope: row.scope,
      client_id_issued_at: Math.floor(new Date(row.created_at).getTime() / 1000),
    });
  } catch (err) {
    next(err);
  }
}
