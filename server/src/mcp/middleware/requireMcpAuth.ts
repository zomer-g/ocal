import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../../config/database.js';
import { mcpJwtSecret, MCP_JWT_AUDIENCE, mcpUrl } from '../config.js';

export interface McpApiUser {
  id: string;
  email: string;
  name: string | null;
  tier: string;
  monthly_quota: number | null;
  client_id: string;
}

declare global {
  namespace Express {
    interface Request {
      apiUser?: McpApiUser;
    }
  }
}

interface AccessTokenClaims {
  sub: string;
  cid: string;
  scope?: string;
  typ?: string;
}

function challenge(req: Request, res: Response, error: string, description: string): void {
  const resourceMetadata = `${mcpUrl(req)}/.well-known/oauth-protected-resource`;
  res.set(
    'WWW-Authenticate',
    `Bearer realm="ocal-mcp", error="${error}", error_description="${description}", resource_metadata="${resourceMetadata}"`,
  );
  res.status(401).json({ error, error_description: description });
}

export async function requireMcpAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.toLowerCase().startsWith('bearer ')) {
    challenge(req, res, 'invalid_token', 'Missing Bearer token');
    return;
  }
  const token = header.slice('bearer '.length).trim();

  let claims: AccessTokenClaims;
  try {
    claims = jwt.verify(token, mcpJwtSecret, { audience: MCP_JWT_AUDIENCE }) as AccessTokenClaims;
  } catch {
    challenge(req, res, 'invalid_token', 'Token invalid or expired');
    return;
  }

  if (claims.typ === 'refresh') {
    challenge(req, res, 'invalid_token', 'Refresh tokens are not accepted at this endpoint');
    return;
  }

  try {
    const user = await db('api_users').where({ id: claims.sub, is_active: true }).first();
    if (!user) {
      challenge(req, res, 'invalid_token', 'User no longer active');
      return;
    }
    req.apiUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      tier: user.tier,
      monthly_quota: user.monthly_quota,
      client_id: claims.cid,
    };
    next();
  } catch (err) {
    next(err);
  }
}
