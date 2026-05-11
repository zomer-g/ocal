/**
 * Admin user management — admin role only.
 *
 *   GET    /api/admin/users       — list all admin_users
 *   POST   /api/admin/users       — invite by email + role
 *   PATCH  /api/admin/users/:id   — change role / activate / deactivate
 *   DELETE /api/admin/users/:id   — soft delete (set is_active=false)
 *
 * Hard delete is intentionally not exposed: reviewed_by foreign keys on
 * document tables reference admin_users(id); we want the audit trail to
 * keep working even after a user leaves.
 */

import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../config/database.js';
import { validate } from '../../middleware/validate.js';
import { logger } from '../../utils/logger.js';

export const adminUsersRouter = Router();

// ── GET / — list ────────────────────────────────────────────────
adminUsersRouter.get('/', async (_req, res, next) => {
  try {
    const rows = await db('admin_users')
      .select('id', 'email', 'name', 'picture_url', 'role', 'is_active', 'last_login', 'created_at')
      .orderBy('created_at', 'desc');
    res.json({ data: rows.map((r) => ({ ...r, role: r.role ?? 'admin' })) });
  } catch (err) {
    next(err);
  }
});

// ── POST / — invite ─────────────────────────────────────────────
const createSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  role: z.enum(['admin', 'content_manager']).default('content_manager'),
});

adminUsersRouter.post('/', validate(createSchema, 'body'), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof createSchema>;
    const existing = await db('admin_users').where({ email: body.email }).first();
    if (existing) {
      res.status(409).json({ error: 'משתמש עם הכתובת הזו כבר קיים' });
      return;
    }
    const [created] = await db('admin_users')
      .insert({
        email: body.email,
        name: body.name ?? null,
        role: body.role,
        is_active: true,
      })
      .returning(['id', 'email', 'name', 'role', 'is_active', 'created_at']);
    logger.info({ email: body.email, role: body.role, invitedBy: req.adminUser?.id }, 'Admin user invited');
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

// ── PATCH /:id — update ─────────────────────────────────────────
const patchSchema = z.object({
  name: z.string().nullable().optional(),
  role: z.enum(['admin', 'content_manager']).optional(),
  is_active: z.boolean().optional(),
});

adminUsersRouter.patch('/:id', validate(patchSchema, 'body'), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof patchSchema>;
    const update: Record<string, unknown> = {};
    if (body.name !== undefined) update.name = body.name;
    if (body.role !== undefined) update.role = body.role;
    if (body.is_active !== undefined) update.is_active = body.is_active;
    if (Object.keys(update).length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }
    // Don't let an admin demote themselves and lock the system out
    if (
      req.params.id === req.adminUser?.id &&
      (body.role === 'content_manager' || body.is_active === false)
    ) {
      res.status(400).json({ error: 'לא ניתן להוריד הרשאות או להשבית את החשבון של עצמך' });
      return;
    }
    const [row] = await db('admin_users')
      .where({ id: req.params.id })
      .update({ ...update, updated_at: new Date() })
      .returning(['id', 'email', 'name', 'role', 'is_active', 'created_at']);
    if (!row) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    logger.info({ userId: req.params.id, changes: update, by: req.adminUser?.id }, 'Admin user updated');
    res.json(row);
  } catch (err) {
    next(err);
  }
});

// ── DELETE /:id — soft delete ───────────────────────────────────
adminUsersRouter.delete('/:id', async (req, res, next) => {
  try {
    if (req.params.id === req.adminUser?.id) {
      res.status(400).json({ error: 'לא ניתן למחוק את החשבון של עצמך' });
      return;
    }
    const deleted = await db('admin_users').where({ id: req.params.id }).update({ is_active: false });
    if (!deleted) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    logger.info({ userId: req.params.id, by: req.adminUser?.id }, 'Admin user soft-deleted');
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});
