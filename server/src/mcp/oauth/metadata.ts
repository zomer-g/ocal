import type { Request, Response } from 'express';
import { mcpUrl, buildBaseUrl } from '../config.js';

/**
 * RFC 9728 — OAuth 2.0 Protected Resource Metadata.
 * Tells the MCP client which Authorization Server to talk to.
 */
export function protectedResourceMetadata(req: Request, res: Response): void {
  res.json({
    resource: mcpUrl(req),
    authorization_servers: [mcpUrl(req)],
    bearer_methods_supported: ['header'],
    resource_documentation: `${buildBaseUrl(req)}/docs/mcp`,
    scopes_supported: ['mcp'],
  });
}

/**
 * RFC 8414 — OAuth 2.0 Authorization Server Metadata.
 * Declares which endpoints + flows + PKCE methods we support.
 */
export function authorizationServerMetadata(req: Request, res: Response): void {
  const base = mcpUrl(req);
  res.json({
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
    scopes_supported: ['mcp'],
  });
}
