/**
 * Daily roll-up of mcp_usage_events into mcp_usage_daily, plus retention.
 *
 * Strategy:
 *   1. For every (api_user_id, day) bucket touched in the last 2 days, recompute
 *      the daily totals from the raw event log and upsert into mcp_usage_daily.
 *      Two days (not one) so a job that runs slightly past midnight still
 *      catches yesterday's tail.
 *   2. Delete raw mcp_usage_events older than MCP_USAGE_EVENTS_RETENTION_DAYS.
 *      Aggregated rows in mcp_usage_daily live forever — they're tiny.
 */

import { db } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { MCP_USAGE_EVENTS_RETENTION_DAYS } from '../mcp/config.js';

const AGGREGATE_LOOKBACK_DAYS = 2;
const RUN_EVERY_HOURS = 24;

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export async function runMcpUsageAggregation(): Promise<{ aggregated: number; deleted: number }> {
  const startedAt = Date.now();

  await db.raw(
    `
    INSERT INTO mcp_usage_daily (api_user_id, day, tool_calls, total_bytes, total_latency_ms, errors, tool_breakdown, updated_at)
    SELECT
      api_user_id,
      DATE(created_at) AS day,
      COUNT(*)::int AS tool_calls,
      COALESCE(SUM(result_bytes), 0)::bigint AS total_bytes,
      COALESCE(SUM(latency_ms), 0)::bigint AS total_latency_ms,
      COUNT(*) FILTER (WHERE status = 'error')::int AS errors,
      COALESCE(jsonb_object_agg(tool_name, calls) FILTER (WHERE tool_name IS NOT NULL), '{}'::jsonb) AS tool_breakdown,
      NOW() AS updated_at
    FROM (
      SELECT
        api_user_id,
        created_at,
        result_bytes,
        latency_ms,
        status,
        tool_name,
        COUNT(*) OVER (PARTITION BY api_user_id, DATE(created_at), tool_name) AS calls
      FROM mcp_usage_events
      WHERE created_at >= NOW() - INTERVAL '${AGGREGATE_LOOKBACK_DAYS} days'
    ) e
    GROUP BY api_user_id, DATE(created_at)
    ON CONFLICT (api_user_id, day) DO UPDATE
      SET tool_calls       = EXCLUDED.tool_calls,
          total_bytes      = EXCLUDED.total_bytes,
          total_latency_ms = EXCLUDED.total_latency_ms,
          errors           = EXCLUDED.errors,
          tool_breakdown   = EXCLUDED.tool_breakdown,
          updated_at       = NOW()
    `,
  );

  const aggregatedResult = await db('mcp_usage_daily')
    .where('updated_at', '>=', db.raw(`NOW() - INTERVAL '5 minutes'`))
    .count('* as c')
    .first();
  const aggregated = Number(aggregatedResult?.c ?? 0);

  const deleted = await db('mcp_usage_events')
    .where('created_at', '<', db.raw(`NOW() - INTERVAL '${MCP_USAGE_EVENTS_RETENTION_DAYS} days'`))
    .del();

  logger.info(
    { aggregated, deleted, durationMs: Date.now() - startedAt },
    'MCP usage aggregation complete',
  );
  return { aggregated, deleted };
}

export function startMcpUsageAggregator(): void {
  if (intervalHandle) return;

  // First run 5 minutes after startup so we never block boot
  setTimeout(() => {
    runMcpUsageAggregation().catch((err) =>
      logger.error({ err }, 'MCP usage aggregation failed'),
    );
  }, 5 * 60 * 1000);

  intervalHandle = setInterval(
    () => {
      runMcpUsageAggregation().catch((err) =>
        logger.error({ err }, 'MCP usage aggregation failed'),
      );
    },
    RUN_EVERY_HOURS * 60 * 60 * 1000,
  );

  logger.info({ everyHours: RUN_EVERY_HOURS }, 'MCP usage aggregator started');
}

export function stopMcpUsageAggregator(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
