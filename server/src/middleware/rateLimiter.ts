import rateLimit from 'express-rate-limit';

// Global concurrency-aware rate limit across all IPs to protect the connection pool.
// Bots like Googlebot use many IPs, so per-IP limits alone are insufficient.
export const globalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: () => 'global',
  message: { error: 'Server is under heavy load, please try again shortly' },
});

export const publicApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

export const adminApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

export const downloadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many download requests, please try again later' },
});

// Tight limit on OAuth-bootstrap endpoints. These are unauthenticated by
// design (anyone can discover metadata or attempt to register a client) so we
// cap them aggressively to make spam pointless. The real access gate is the
// email allow-list in /oauth/authorize.
export const mcpOauthLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests' },
});

// Limit per IP on authenticated MCP tool calls. We rely on Bearer-token auth
// + per-user usage tracking for real billing limits; this is just a guardrail
// against a leaked token being abused.
export const mcpToolLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests' },
});
