import type { Request } from 'express';
import { env } from '../config/env.js';

export const MCP_PREFIX = '/mcp';
export const MCP_JWT_AUDIENCE = 'ocal-mcp';
export const MCP_ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
export const MCP_AUTH_CODE_TTL_SECONDS = 10 * 60;
export const MCP_USAGE_EVENTS_RETENTION_DAYS = 90;

/**
 * Build a public base URL (scheme + host) from the incoming request. Used to
 * fill resource/authorization-server metadata so the values reflect whichever
 * domain the client called (ocal.org.il, render.com URL, localhost, etc.).
 */
export function buildBaseUrl(req: Request): string {
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host');
  return `${proto}://${host}`;
}

export function mcpUrl(req: Request, path = ''): string {
  return `${buildBaseUrl(req)}${MCP_PREFIX}${path}`;
}

export const mcpJwtSecret = env.JWT_SECRET;
