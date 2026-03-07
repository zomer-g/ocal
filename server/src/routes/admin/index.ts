import { Router } from 'express';
import { requireAdmin } from '../../middleware/auth.js';
import { adminApiLimiter } from '../../middleware/rateLimiter.js';
import { authRouter } from './auth.js';
import { adminSourcesRouter } from './sources.js';
import { adminSyncRouter } from './sync.js';
import { adminEventsRouter } from './events.js';
import { adminExceptionsRouter } from './exceptions.js';
import { adminPeopleRouter } from './people.js';
import { adminOrgsRouter } from './orgs.js';
import { adminEntitiesRouter } from './entities.js';
import { adminExportRouter } from './export.js';
import { adminContentRouter } from './content.js';

export const adminRoutes = Router();

// Auth routes (no auth required for login flow)
adminRoutes.use('/auth', authRouter);

// All other admin routes require authentication
adminRoutes.use(adminApiLimiter);
adminRoutes.use(requireAdmin);

adminRoutes.use('/sources', adminSourcesRouter);
adminRoutes.use('/sync', adminSyncRouter);
adminRoutes.use('/events', adminEventsRouter);
adminRoutes.use('/exceptions', adminExceptionsRouter);
adminRoutes.use('/people', adminPeopleRouter);
adminRoutes.use('/organizations', adminOrgsRouter);
adminRoutes.use('/entities', adminEntitiesRouter);
adminRoutes.use('/export', adminExportRouter);
adminRoutes.use('/content', adminContentRouter);
