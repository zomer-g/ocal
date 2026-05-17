/**
 * Closed-beta access list management for the MCP server. Admin role only.
 *
 *   GET    /api/admin/mcp-users        — list api_users + 30-day usage summary
 *   POST   /api/admin/mcp-users        — invite by email
 *   PATCH  /api/admin/mcp-users/:id    — tier / quota / is_active
 *   DELETE /api/admin/mcp-users/:id    — soft delete (is_active=false)
 */

import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../config/database.js';
import { validate } from '../../middleware/validate.js';
import { logger } from '../../utils/logger.js';

export const adminMcpUsersRouter = Router();

adminMcpUsersRouter.get('/', async (_req, res, next) => {
  try {
    const users = await db('api_users')
      .leftJoin(
        db('mcp_usage_daily')
          .select('api_user_id')
          .sum({ calls_30d: 'tool_calls', bytes_30d: 'total_bytes', errors_30d: 'errors' })
          .where('day', '>=', db.raw("CURRENT_DATE - INTERVAL '30 days'"))
          .groupBy('api_user_id')
          .as('u30'),
        'u30.api_user_id',
        'api_users.id',
      )
      .select(
        'api_users.id',
        'api_users.email',
        'api_users.name',
        'api_users.tier',
        'api_users.monthly_quota',
        'api_users.is_active',
        'api_users.invited_by',
        'api_users.last_seen_at',
        'api_users.created_at',
        'u30.calls_30d',
        'u30.bytes_30d',
        'u30.errors_30d',
      )
      .orderBy('api_users.created_at', 'desc');

    res.json({
      data: users.map((u) => ({
        ...u,
        calls_30d: Number(u.calls_30d ?? 0),
        bytes_30d: Number(u.bytes_30d ?? 0),
        errors_30d: Number(u.errors_30d ?? 0),
      })),
    });
  } catch (err) {
    next(err);
  }
});

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  tier: z.enum(['beta', 'free', 'pro']).default('beta'),
  monthly_quota: z.number().int().positive().nullable().optional(),
});

adminMcpUsersRouter.post('/', validate(createSchema, 'body'), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof createSchema>;
    const existing = await db('api_users').where({ email: body.email }).first();
    if (existing) {
      res.status(409).json({ error: 'משתמש MCP עם הכתובת הזו כבר קיים' });
      return;
    }
    const [created] = await db('api_users')
      .insert({
        email: body.email,
        name: body.name ?? null,
        tier: body.tier,
        monthly_quota: body.monthly_quota ?? null,
        invited_by: req.adminUser?.id ?? null,
        is_active: true,
      })
      .returning(['id', 'email', 'name', 'tier', 'monthly_quota', 'is_active', 'created_at']);
    logger.info({ email: body.email, tier: body.tier, invitedBy: req.adminUser?.id }, 'MCP API user invited');
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

const patchSchema = z.object({
  name: z.string().nullable().optional(),
  tier: z.enum(['beta', 'free', 'pro']).optional(),
  monthly_quota: z.number().int().positive().nullable().optional(),
  is_active: z.boolean().optional(),
});

adminMcpUsersRouter.patch('/:id', validate(patchSchema, 'body'), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof patchSchema>;
    const update: Record<string, unknown> = {};
    if (body.name !== undefined) update.name = body.name;
    if (body.tier !== undefined) update.tier = body.tier;
    if (body.monthly_quota !== undefined) update.monthly_quota = body.monthly_quota;
    if (body.is_active !== undefined) update.is_active = body.is_active;
    if (Object.keys(update).length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }
    const [row] = await db('api_users')
      .where({ id: req.params.id })
      .update({ ...update, updated_at: new Date() })
      .returning(['id', 'email', 'name', 'tier', 'monthly_quota', 'is_active']);
    if (!row) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    logger.info({ userId: req.params.id, changes: update, by: req.adminUser?.id }, 'MCP API user updated');
    res.json(row);
  } catch (err) {
    next(err);
  }
});

adminMcpUsersRouter.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await db('api_users').where({ id: req.params.id }).update({ is_active: false });
    if (!deleted) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    logger.info({ userId: req.params.id, by: req.adminUser?.id }, 'MCP API user soft-deleted');
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});
