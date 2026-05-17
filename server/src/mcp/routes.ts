import { Router, type Request, type Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { protectedResourceMetadata, authorizationServerMetadata } from './oauth/metadata.js';
import { authorize, googleCallback } from './oauth/authorize.js';
import { token } from './oauth/token.js';
import { registerClient } from './oauth/register.js';
import { requireMcpAuth } from './middleware/requireMcpAuth.js';
import { mcpOauthLimiter, mcpToolLimiter } from '../middleware/rateLimiter.js';
import { buildMcpServerForUser } from './server.js';
import { logger } from '../utils/logger.js';

export const mcpRoutes = Router();

// ── OAuth 2.1 metadata (RFC 8414 + RFC 9728) ────────────────────────────
// Metadata is public per spec but cheap; keep behind the limiter anyway.
mcpRoutes.get('/.well-known/oauth-protected-resource', mcpOauthLimiter, protectedResourceMetadata);
mcpRoutes.get('/.well-known/oauth-authorization-server', mcpOauthLimiter, authorizationServerMetadata);

// ── OAuth endpoints ─────────────────────────────────────────────────────
// All unauthenticated; the real access gate is the api_users email check
// inside the authorize handler. The rate limiter makes brute-force pointless.
mcpRoutes.post('/oauth/register', mcpOauthLimiter, registerClient);
mcpRoutes.get('/oauth/authorize', mcpOauthLimiter, authorize);
mcpRoutes.get('/oauth/google/callback', mcpOauthLimiter, googleCallback);
mcpRoutes.post('/oauth/token', mcpOauthLimiter, token);

// ── MCP endpoint ────────────────────────────────────────────────────────
async function handleMcp(req: Request, res: Response): Promise<void> {
  if (!req.apiUser) {
    res.status(500).json({ error: 'server_error', error_description: 'auth middleware did not populate apiUser' });
    return;
  }
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const server = buildMcpServerForUser({
    user: req.apiUser,
    sessionId: (req.headers['mcp-session-id'] as string) ?? null,
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on('close', () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });
  } catch (err) {
    logger.error({ err, apiUserId: req.apiUser.id }, 'MCP request handler failed');
    if (!res.headersSent) {
      res.status(500).json({ error: 'server_error' });
    }
  }
}

mcpRoutes.post('/', mcpToolLimiter, requireMcpAuth, handleMcp);
mcpRoutes.get('/', mcpToolLimiter, requireMcpAuth, handleMcp);
mcpRoutes.delete('/', mcpToolLimiter, requireMcpAuth, handleMcp);
