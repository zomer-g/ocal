import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { globalApiLimiter, publicApiLimiter } from './middleware/rateLimiter.js';
import { publicRoutes } from './routes/public/index.js';
import { adminRoutes } from './routes/admin/index.js';
import { mcpRoutes } from './mcp/routes.js';
import { protectedResourceMetadata, authorizationServerMetadata } from './mcp/oauth/metadata.js';
import { startScheduler } from './services/scheduler.js';
import { startMcpUsageAggregator } from './services/mcpUsageAggregator.js';
import { warmEntityCache } from './routes/public/entities.js';

const app = express();

// Render (and most PaaS) runs behind a reverse proxy
app.set('trust proxy', 1);

// Core middleware
app.use(helmet({ contentSecurityPolicy: false }));

// MCP is consumed cross-origin by Claude.ai / ChatGPT / MCP Inspector — must
// run BEFORE the global cors() below, otherwise the global one short-circuits
// OPTIONS preflight requests with the ocal.org.il-only origin and external
// clients are blocked. Per-route handler in mcp/routes.ts handles per-method
// CORS; this layer is here just to intercept the preflight before the global
// cors() can see it.
const mcpCors = cors({
  origin: true,
  credentials: false,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'Accept', 'Mcp-Session-Id', 'Last-Event-Id'],
  exposedHeaders: ['Mcp-Session-Id', 'WWW-Authenticate'],
  maxAge: 86400,
});
app.use('/mcp', mcpCors);

// RFC 8414 / RFC 9728 require the metadata at /.well-known/<type>/<path>
// when the issuer URL has a path component. Claude.ai expects discovery at
// these paths — without them it can't find the auth server and shows a
// "start_error". Must be registered BEFORE the SPA static fallback below or
// it'll be served index.html.
app.get('/.well-known/oauth-protected-resource/mcp', mcpCors, protectedResourceMetadata);
app.get('/.well-known/oauth-authorization-server/mcp', mcpCors, authorizationServerMetadata);

app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '10mb' }));
// OAuth 2.0 RFC 6749 §4.1.3: the /token endpoint MUST accept
// application/x-www-form-urlencoded bodies. Mounted globally; tiny payloads.
app.use(express.urlencoded({ extended: false, limit: '64kb' }));
app.use(cookieParser());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes — global limiter protects against multi-IP bot floods
app.use('/api', globalApiLimiter);
app.use('/api/public', publicApiLimiter, publicRoutes);
app.use('/api/admin', adminRoutes);
app.use('/mcp', mcpRoutes);

// Serve React build in production
if (env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Error handler
app.use(errorHandler);

app.listen(env.PORT, () => {
  logger.info(`Server running on port ${env.PORT}`);
  startScheduler().catch((err) => logger.error({ err }, 'Failed to start auto-import scheduler'));
  startMcpUsageAggregator();
  warmEntityCache().catch(() => {});
});

export default app;
