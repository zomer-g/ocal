import { Router } from 'express';
import { requireRole, requireAdminOrContentManager } from '../../middleware/auth.js';
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
import { adminAutomationRouter } from './automation.js';
import { adminManualUploadsRouter } from './manualUploads.js';
import { adminExpenseImportsRouter } from './expenseImports.js';
import { adminUsersRouter } from './users.js';
import { adminDocumentsRouter } from './documents.js';
import { adminMcpUsersRouter } from './mcpUsers.js';
import { adminMcpUsageRouter } from './mcpUsage.js';

export const adminRoutes = Router();

// Auth routes (no auth required for login flow)
adminRoutes.use('/auth', authRouter);

// All other admin routes require authentication + rate limit.
adminRoutes.use(adminApiLimiter);

// ── Read + edit + approve — open to admin AND content_manager ─────
adminRoutes.use('/sources',          requireAdminOrContentManager, adminSourcesRouter);
adminRoutes.use('/events',           requireAdminOrContentManager, adminEventsRouter);
adminRoutes.use('/people',           requireAdminOrContentManager, adminPeopleRouter);
adminRoutes.use('/organizations',    requireAdminOrContentManager, adminOrgsRouter);
adminRoutes.use('/entities',         requireAdminOrContentManager, adminEntitiesRouter);
adminRoutes.use('/manual-uploads',   requireAdminOrContentManager, adminManualUploadsRouter);
adminRoutes.use('/expense-imports',  requireAdminOrContentManager, adminExpenseImportsRouter);
adminRoutes.use('/documents',        requireAdminOrContentManager, adminDocumentsRouter);
adminRoutes.use('/export',           requireAdminOrContentManager, adminExportRouter);

// ── Destructive / global config — admin only ──────────────────────
// /sync triggers CKAN imports + resyncs, /automation manages the
// auto-scan worker, /exceptions persists permanent excludes,
// /content edits homepage copy, /users manages the admin team.
adminRoutes.use('/sync',        requireRole('admin'), adminSyncRouter);
adminRoutes.use('/automation',  requireRole('admin'), adminAutomationRouter);
adminRoutes.use('/exceptions',  requireRole('admin'), adminExceptionsRouter);
adminRoutes.use('/content',     requireRole('admin'), adminContentRouter);
adminRoutes.use('/users',       requireRole('admin'), adminUsersRouter);
adminRoutes.use('/mcp-users',   requireRole('admin'), adminMcpUsersRouter);
adminRoutes.use('/mcp-usage',   requireRole('admin'), adminMcpUsageRouter);

// NOTE: per-method gates inside individual routers (e.g. DELETE on
// manual-uploads is admin-only even though the rest is open to CMs)
// are applied inline using requireRole('admin') as route-level
// middleware. See routes/admin/manualUploads.ts:DELETE for the pattern.
