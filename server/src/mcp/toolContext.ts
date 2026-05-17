import type { McpApiUser } from './middleware/requireMcpAuth.js';
import { logUsage } from './middleware/usageLogger.js';

/**
 * Shared per-request context passed into every tool handler. Carries the
 * authenticated user (for filtering/quotas) and the session id (for usage
 * log grouping). Built by mcpRequestHandler before instantiating McpServer.
 */
export interface ToolContext {
  user: McpApiUser;
  sessionId: string | null;
}

export interface ToolResultPayload {
  data: unknown;
  /**
   * If the tool naturally returns a list, set this so usage logs capture
   * how much was returned for billing. Optional.
   */
  count?: number;
}

/**
 * Wraps a tool implementation with timing + usage logging + error handling so
 * every tool emits a single mcp_usage_events row regardless of outcome.
 */
export async function runTool<TArgs>(
  ctx: ToolContext,
  toolName: string,
  args: TArgs,
  impl: (args: TArgs) => Promise<ToolResultPayload>,
): Promise<{ content: { type: 'text'; text: string }[]; isError?: boolean }> {
  const started = Date.now();
  try {
    const result = await impl(args);
    const json = JSON.stringify(result.data, null, 2);
    logUsage({
      api_user_id: ctx.user.id,
      client_id: ctx.user.client_id,
      mcp_session_id: ctx.sessionId,
      tool_name: toolName,
      request_params: args,
      result_count: result.count ?? null,
      result_bytes: Buffer.byteLength(json, 'utf8'),
      latency_ms: Date.now() - started,
      status: 'ok',
      error_message: null,
    });
    return { content: [{ type: 'text', text: json }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logUsage({
      api_user_id: ctx.user.id,
      client_id: ctx.user.client_id,
      mcp_session_id: ctx.sessionId,
      tool_name: toolName,
      request_params: args,
      result_count: null,
      result_bytes: null,
      latency_ms: Date.now() - started,
      status: 'error',
      error_message: message.slice(0, 1000),
    });
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true,
    };
  }
}
