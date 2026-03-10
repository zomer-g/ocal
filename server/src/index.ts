import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { publicApiLimiter } from './middleware/rateLimiter.js';
import { publicRoutes } from './routes/public/index.js';
import { adminRoutes } from './routes/admin/index.js';
import { startScheduler } from './services/scheduler.js';
import { warmEntityCache } from './routes/public/entities.js';

const app = express();

// Core middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/public', publicApiLimiter, publicRoutes);
app.use('/api/admin', adminRoutes);

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
  warmEntityCache().catch(() => {});
});

export default app;
