import { db } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

export interface UsageEvent {
  api_user_id: string;
  client_id: string | null;
  mcp_session_id: string | null;
  tool_name: string;
  request_params: unknown;
  result_count: number | null;
  result_bytes: number | null;
  latency_ms: number;
  status: 'ok' | 'error' | 'rate_limited';
  error_message: string | null;
}

/**
 * Fire-and-forget INSERT. We never block the caller on usage logging — if the
 * DB is slow or down, the user still gets their response. Errors are logged.
 *
 * Sensitive fields in request_params (none today, but future-proof) should be
 * stripped by the caller before passing in.
 */
export function logUsage(event: UsageEvent): void {
  db('mcp_usage_events')
    .insert({
      api_user_id: event.api_user_id,
      client_id: event.client_id,
      mcp_session_id: event.mcp_session_id,
      tool_name: event.tool_name,
      request_params: event.request_params ? JSON.stringify(event.request_params) : null,
      result_count: event.result_count,
      result_bytes: event.result_bytes,
      latency_ms: event.latency_ms,
      status: event.status,
      error_message: event.error_message,
    })
    .catch((err) => {
      logger.error({ err, toolName: event.tool_name }, 'Failed to log MCP usage event');
    });
}
