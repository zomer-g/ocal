import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Loader2, AlertCircle, Trash2, BarChart3, Activity, AlertTriangle, Users as UsersIcon } from 'lucide-react';
import {
  listMcpUsers,
  createMcpUser,
  updateMcpUser,
  deleteMcpUser,
  getMcpUsageSummary,
  getMcpUserDetail,
  type McpUserRow,
  type McpTier,
} from '@/api/mcpUsers';

const TIER_LABEL: Record<McpTier, string> = {
  beta: 'בטא',
  free: 'חינמי',
  pro: 'פרו',
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function McpUsersPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newTier, setNewTier] = useState<McpTier>('beta');
  const [newQuota, setNewQuota] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const { data: users = [] } = useQuery({ queryKey: ['admin', 'mcp-users'], queryFn: listMcpUsers });
  const { data: summary } = useQuery({ queryKey: ['admin', 'mcp-usage'], queryFn: getMcpUsageSummary });
  const { data: detail } = useQuery({
    queryKey: ['admin', 'mcp-usage', selectedUserId],
    queryFn: () => getMcpUserDetail(selectedUserId!),
    enabled: !!selectedUserId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'mcp-users'] });
    queryClient.invalidateQueries({ queryKey: ['admin', 'mcp-usage'] });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      createMcpUser({
        email: newEmail.trim(),
        name: newName.trim() || undefined,
        tier: newTier,
        monthly_quota: newQuota.trim() ? Number(newQuota.trim()) : null,
      }),
    onSuccess: () => {
      setNewEmail('');
      setNewName('');
      setNewTier('beta');
      setNewQuota('');
      setError('');
      invalidate();
    },
    onError: (err: Error) => setError(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updateMcpUser>[1] }) =>
      updateMcpUser(id, patch),
    onSuccess: invalidate,
    onError: (err: Error) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteMcpUser,
    onSuccess: invalidate,
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">MCP — משתמשים ושימוש</h1>
        <p className="text-sm text-gray-600">
          ניהול גישה ל-MCP API של Ocal (closed beta). כל משתמש מוזמן מקבל גישה דרך Google SSO ל-
          <code className="text-xs bg-gray-100 px-1 rounded mx-1" dir="ltr">https://ocal.org.il/mcp</code>
          וניתן לעקוב אחר היקף השימוש שלו כתשתית לחיוב עתידי.
        </p>
      </div>

      {/* Summary tiles */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <SummaryTile icon={Activity} label={`קריאות (${summary.range_days} ימים)`} value={summary.totals.total_calls.toLocaleString('he-IL')} />
          <SummaryTile icon={BarChart3} label="נתונים שהוחזרו" value={formatBytes(summary.totals.total_bytes)} />
          <SummaryTile icon={UsersIcon} label="משתמשים פעילים" value={summary.totals.active_users.toLocaleString('he-IL')} />
          <SummaryTile icon={AlertTriangle} label="שגיאות" value={summary.totals.total_errors.toLocaleString('he-IL')} />
        </div>
      )}

      {/* Invite form */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 inline-flex items-center gap-1.5">
          <UserPlus className="w-4 h-4" /> הזמנת משתמש ל-MCP
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
          <input
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="email@domain.com"
            type="email"
            className="md:col-span-2 text-sm border border-gray-300 rounded px-2 py-1.5"
            dir="ltr"
          />
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="שם (אופציונלי)"
            className="text-sm border border-gray-300 rounded px-2 py-1.5"
          />
          <select
            value={newTier}
            onChange={(e) => setNewTier(e.target.value as McpTier)}
            className="text-sm border border-gray-300 rounded px-2 py-1.5 bg-white"
          >
            <option value="beta">{TIER_LABEL.beta}</option>
            <option value="free">{TIER_LABEL.free}</option>
            <option value="pro">{TIER_LABEL.pro}</option>
          </select>
          <input
            value={newQuota}
            onChange={(e) => setNewQuota(e.target.value)}
            placeholder="קוואטה חודשית (אופציונלי)"
            type="number"
            min="1"
            className="text-sm border border-gray-300 rounded px-2 py-1.5"
          />
        </div>
        <div className="flex items-center justify-between mt-3">
          {error && (
            <span className="inline-flex items-center gap-1 text-xs text-red-700">
              <AlertCircle className="w-3.5 h-3.5" /> {error}
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              if (!newEmail.trim()) { setError('יש להזין כתובת אימייל'); return; }
              setError('');
              createMutation.mutate();
            }}
            disabled={createMutation.isPending}
            className="px-3 py-1.5 text-sm bg-primary-700 text-white rounded hover:bg-primary-800 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            הזמן
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          לאחר ההזמנה, המשתמש יוכל להתחבר מ-Claude.ai / ChatGPT דרך ה-connector של Ocal
          (Settings → Connectors → URL: <code className="bg-gray-100 px-1 rounded" dir="ltr">https://ocal.org.il/mcp</code>).
        </p>
      </div>

      {/* User list */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-700 text-xs">
            <tr>
              <th className="text-right px-3 py-2 font-semibold">משתמש</th>
              <th className="text-right px-3 py-2 font-semibold">Tier</th>
              <th className="text-right px-3 py-2 font-semibold">קוואטה</th>
              <th className="text-right px-3 py-2 font-semibold">קריאות (30 ימים)</th>
              <th className="text-right px-3 py-2 font-semibold">נתונים</th>
              <th className="text-right px-3 py-2 font-semibold">פעיל</th>
              <th className="text-right px-3 py-2 font-semibold">פעילות אחרונה</th>
              <th className="text-right px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((u: McpUserRow) => (
              <tr
                key={u.id}
                onClick={() => setSelectedUserId(u.id)}
                className={`hover:bg-gray-50 cursor-pointer ${selectedUserId === u.id ? 'bg-primary-50' : ''}`}
              >
                <td className="px-3 py-2">
                  <div className="font-medium text-gray-900">{u.name || u.email}</div>
                  {u.name && <div className="text-xs text-gray-500" dir="ltr">{u.email}</div>}
                </td>
                <td className="px-3 py-2">
                  <select
                    value={u.tier}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => updateMutation.mutate({ id: u.id, patch: { tier: e.target.value as McpTier } })}
                    className="text-xs border border-gray-300 rounded px-1.5 py-0.5 bg-white"
                  >
                    <option value="beta">{TIER_LABEL.beta}</option>
                    <option value="free">{TIER_LABEL.free}</option>
                    <option value="pro">{TIER_LABEL.pro}</option>
                  </select>
                </td>
                <td className="px-3 py-2 text-xs text-gray-700">
                  {u.monthly_quota?.toLocaleString('he-IL') ?? '∞'}
                </td>
                <td className="px-3 py-2 font-mono text-xs">{u.calls_30d.toLocaleString('he-IL')}</td>
                <td className="px-3 py-2 font-mono text-xs">{formatBytes(u.bytes_30d)}</td>
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <label className="inline-flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={u.is_active}
                      onChange={(e) => updateMutation.mutate({ id: u.id, patch: { is_active: e.target.checked } })}
                    />
                    <span className="text-xs">{u.is_active ? 'פעיל' : 'מושבת'}</span>
                  </label>
                </td>
                <td className="px-3 py-2 text-xs text-gray-500">
                  {u.last_seen_at ? new Date(u.last_seen_at).toLocaleString('he-IL') : '—'}
                </td>
                <td className="px-3 py-2 text-end" onClick={(e) => e.stopPropagation()}>
                  {u.is_active && (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`להשבית את ${u.email}?`)) deleteMutation.mutate(u.id);
                      }}
                      className="p-1 text-red-500 hover:bg-red-50 rounded"
                      aria-label="השבת"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-sm text-gray-500">
                  אין משתמשים. הזמן את הראשון מהטופס למעלה.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Per-user detail */}
      {detail && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-700">פירוט שימוש: {detail.user.name || detail.user.email}</h2>
              <div className="text-xs text-gray-500" dir="ltr">{detail.user.email}</div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedUserId(null)}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              סגור
            </button>
          </div>

          {detail.daily_series.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">אין שימוש מתועד עדיין.</p>
          ) : (
            <>
              <h3 className="text-xs font-semibold text-gray-600 mb-2">שימוש יומי (30 ימים)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs mb-4">
                  <thead className="bg-gray-50 text-gray-700">
                    <tr>
                      <th className="text-right px-2 py-1 font-semibold">יום</th>
                      <th className="text-right px-2 py-1 font-semibold">קריאות</th>
                      <th className="text-right px-2 py-1 font-semibold">נתונים</th>
                      <th className="text-right px-2 py-1 font-semibold">שגיאות</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {detail.daily_series.map((d) => (
                      <tr key={d.day}>
                        <td className="px-2 py-1">{new Date(d.day).toLocaleDateString('he-IL')}</td>
                        <td className="px-2 py-1 font-mono">{d.tool_calls.toLocaleString('he-IL')}</td>
                        <td className="px-2 py-1 font-mono">{formatBytes(Number(d.total_bytes))}</td>
                        <td className="px-2 py-1 font-mono">{d.errors}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <h3 className="text-xs font-semibold text-gray-600 mb-2">קריאות אחרונות</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-700">
                    <tr>
                      <th className="text-right px-2 py-1 font-semibold">זמן</th>
                      <th className="text-right px-2 py-1 font-semibold">Tool</th>
                      <th className="text-right px-2 py-1 font-semibold">תוצאות</th>
                      <th className="text-right px-2 py-1 font-semibold">Latency</th>
                      <th className="text-right px-2 py-1 font-semibold">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {detail.recent_events.map((e) => (
                      <tr key={e.id}>
                        <td className="px-2 py-1">{new Date(e.created_at).toLocaleString('he-IL')}</td>
                        <td className="px-2 py-1 font-mono" dir="ltr">{e.tool_name}</td>
                        <td className="px-2 py-1 font-mono">{e.result_count ?? '—'}</td>
                        <td className="px-2 py-1 font-mono">{e.latency_ms ? `${e.latency_ms}ms` : '—'}</td>
                        <td className="px-2 py-1">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            e.status === 'ok'
                              ? 'bg-green-100 text-green-700'
                              : e.status === 'error'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-yellow-100 text-yellow-700'
                          }`}>
                            {e.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryTile({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3">
      <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <div className="text-xl font-bold text-gray-900 font-mono">{value}</div>
    </div>
  );
}
