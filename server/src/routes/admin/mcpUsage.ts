/**
 * MCP usage dashboard. Admin role only.
 *
 *   GET /api/admin/mcp-usage              — totals + per-tool breakdown (last 30 days, all users)
 *   GET /api/admin/mcp-usage/:userId      — daily + per-tool breakdown for a single user
 */

import { Router } from 'express';
import { db } from '../../config/database.js';

export const adminMcpUsageRouter = Router();

const RANGE_DAYS = 30;

adminMcpUsageRouter.get('/', async (_req, res, next) => {
  try {
    const totals = await db('mcp_usage_daily')
      .where('day', '>=', db.raw(`CURRENT_DATE - INTERVAL '${RANGE_DAYS} days'`))
      .select(
        db.raw('COALESCE(SUM(tool_calls), 0)::bigint as total_calls'),
        db.raw('COALESCE(SUM(total_bytes), 0)::bigint as total_bytes'),
        db.raw('COALESCE(SUM(errors), 0)::bigint as total_errors'),
        db.raw('COUNT(DISTINCT api_user_id) as active_users'),
      )
      .first();

    const dailySeries = (await db('mcp_usage_daily')
      .where('day', '>=', db.raw(`CURRENT_DATE - INTERVAL '${RANGE_DAYS} days'`))
      .select('day')
      .sum({ calls: 'tool_calls', bytes: 'total_bytes', errors: 'errors' })
      .groupBy('day')
      .orderBy('day', 'asc')) as { day: string; calls?: unknown; bytes?: unknown; errors?: unknown }[];

    const toolBreakdown = await db('mcp_usage_events')
      .where('created_at', '>=', db.raw(`NOW() - INTERVAL '${RANGE_DAYS} days'`))
      .select('tool_name')
      .count('* as calls')
      .sum({ bytes: 'result_bytes' })
      .avg({ avg_latency_ms: 'latency_ms' })
      .groupBy('tool_name')
      .orderBy('calls', 'desc');

    res.json({
      range_days: RANGE_DAYS,
      totals: {
        total_calls: Number(totals?.total_calls ?? 0),
        total_bytes: Number(totals?.total_bytes ?? 0),
        total_errors: Number(totals?.total_errors ?? 0),
        active_users: Number(totals?.active_users ?? 0),
      },
      daily_series: dailySeries.map((d) => ({
        day: d.day,
        calls: Number(d.calls ?? 0),
        bytes: Number(d.bytes ?? 0),
        errors: Number(d.errors ?? 0),
      })),
      tool_breakdown: toolBreakdown.map((t) => ({
        tool_name: t.tool_name,
        calls: Number(t.calls),
        bytes: Number(t.bytes ?? 0),
        avg_latency_ms: t.avg_latency_ms ? Math.round(Number(t.avg_latency_ms)) : 0,
      })),
    });
  } catch (err) {
    next(err);
  }
});

adminMcpUsageRouter.get('/:userId', async (req, res, next) => {
  try {
    const user = await db('api_users').where({ id: req.params.userId }).first();
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const dailySeries = await db('mcp_usage_daily')
      .where('api_user_id', req.params.userId)
      .where('day', '>=', db.raw(`CURRENT_DATE - INTERVAL '${RANGE_DAYS} days'`))
      .select('day', 'tool_calls', 'total_bytes', 'total_latency_ms', 'errors', 'tool_breakdown')
      .orderBy('day', 'asc');

    const recentEvents = await db('mcp_usage_events')
      .where('api_user_id', req.params.userId)
      .orderBy('created_at', 'desc')
      .limit(50)
      .select('id', 'tool_name', 'result_count', 'result_bytes', 'latency_ms', 'status', 'error_message', 'created_at');

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        tier: user.tier,
        monthly_quota: user.monthly_quota,
        is_active: user.is_active,
      },
      daily_series: dailySeries,
      recent_events: recentEvents,
    });
  } catch (err) {
    next(err);
  }
});
