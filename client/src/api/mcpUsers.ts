import { api } from './client';

export type McpTier = 'beta' | 'free' | 'pro';

export interface McpUserRow {
  id: string;
  email: string;
  name: string | null;
  tier: McpTier;
  monthly_quota: number | null;
  is_active: boolean;
  invited_by: string | null;
  last_seen_at: string | null;
  created_at: string;
  calls_30d: number;
  bytes_30d: number;
  errors_30d: number;
}

export interface McpDailyUsageRow {
  day: string;
  tool_calls: number;
  total_bytes: number;
  total_latency_ms: number;
  errors: number;
  tool_breakdown: Record<string, number>;
}

export interface McpUsageEventRow {
  id: number;
  tool_name: string;
  result_count: number | null;
  result_bytes: number | null;
  latency_ms: number | null;
  status: 'ok' | 'error' | 'rate_limited';
  error_message: string | null;
  created_at: string;
}

export interface McpUsageSummary {
  range_days: number;
  totals: {
    total_calls: number;
    total_bytes: number;
    total_errors: number;
    active_users: number;
  };
  daily_series: { day: string; calls: number; bytes: number; errors: number }[];
  tool_breakdown: { tool_name: string; calls: number; bytes: number; avg_latency_ms: number }[];
}

export interface McpUserDetail {
  user: { id: string; email: string; name: string | null; tier: McpTier; monthly_quota: number | null; is_active: boolean };
  daily_series: McpDailyUsageRow[];
  recent_events: McpUsageEventRow[];
}

export async function listMcpUsers(): Promise<McpUserRow[]> {
  const { data } = await api.get('/admin/mcp-users');
  return data.data;
}

export async function createMcpUser(input: {
  email: string;
  name?: string;
  tier?: McpTier;
  monthly_quota?: number | null;
}): Promise<McpUserRow> {
  const { data } = await api.post('/admin/mcp-users', input);
  return data;
}

export async function updateMcpUser(
  id: string,
  patch: { name?: string | null; tier?: McpTier; monthly_quota?: number | null; is_active?: boolean },
): Promise<McpUserRow> {
  const { data } = await api.patch(`/admin/mcp-users/${id}`, patch);
  return data;
}

export async function deleteMcpUser(id: string): Promise<void> {
  await api.delete(`/admin/mcp-users/${id}`);
}

export async function getMcpUsageSummary(): Promise<McpUsageSummary> {
  const { data } = await api.get('/admin/mcp-usage');
  return data;
}

export async function getMcpUserDetail(userId: string): Promise<McpUserDetail> {
  const { data } = await api.get(`/admin/mcp-usage/${userId}`);
  return data;
}
