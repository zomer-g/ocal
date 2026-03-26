import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAutomationStatus,
  updateAutomationSettings,
  triggerScan,
  clearAndRescan,
  getAutomationQueue,
  approveQueueItem,
  rejectQueueItem,
  deleteQueueItem,
  getAutomationLogs,
  getPeople,
  getOrganizations,
  type QueueItem,
  type FieldMapping,
  type AutomationSettings,
} from '@/api/admin';
import {
  Loader2,
  Play,
  RefreshCw,
  Settings,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Zap,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Trash2,
} from 'lucide-react';

const SOURCE_COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316', '#6366F1', '#14B8A6',
];

/** Fields to check for the recognition score */
const SCORE_FIELDS: Array<{ key: string; label: string; required?: boolean }> = [
  { key: 'title', label: 'כותרת', required: true },
  { key: 'start_date', label: 'תאריך', required: true },
  { key: 'start_time', label: 'שעה' },
  { key: 'end_date', label: 'סיום' },
  { key: 'end_time', label: 'שעת סיום' },
  { key: 'location', label: 'מיקום' },
  { key: 'participants', label: 'משתתפים' },
];

/** Calculate field recognition score from a mapping object */
function calcFieldScore(mapping: Record<string, string | undefined> | null | undefined) {
  if (!mapping) return { mapped: 0, total: SCORE_FIELDS.length, fields: {} as Record<string, boolean> };
  const fields: Record<string, boolean> = {};
  let mapped = 0;
  for (const f of SCORE_FIELDS) {
    const val = mapping[f.key];
    const ok = !!val && val.trim() !== '';
    fields[f.key] = ok;
    if (ok) mapped++;
  }
  return { mapped, total: SCORE_FIELDS.length, fields };
}

const STATUS_LABELS: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  pending: { label: 'ממתין לבדיקה', color: 'text-yellow-600 bg-yellow-50', icon: Clock },
  auto_imported: { label: 'יובא אוטומטית', color: 'text-green-600 bg-green-50', icon: CheckCircle },
  approved: { label: 'אושר', color: 'text-blue-600 bg-blue-50', icon: CheckCircle },
  rejected: { label: 'נדחה', color: 'text-red-600 bg-red-50', icon: XCircle },
  error: { label: 'שגיאה', color: 'text-red-600 bg-red-50', icon: AlertTriangle },
};

export function AutomationPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'pending' | 'imported' | 'logs'>('pending');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ── Data queries ──
  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ['automation-status'],
    queryFn: getAutomationStatus,
    refetchInterval: 10000,
  });

  const { data: pendingQueue } = useQuery({
    queryKey: ['automation-queue', 'pending'],
    queryFn: () => getAutomationQueue({ status: 'pending', limit: 50 }),
  });

  const { data: importedQueue } = useQuery({
    queryKey: ['automation-queue', 'imported'],
    queryFn: () => getAutomationQueue({ status: 'auto_imported', limit: 50 }),
  });

  const { data: logs } = useQuery({
    queryKey: ['automation-logs'],
    queryFn: () => getAutomationLogs({ limit: 20 }),
    enabled: activeTab === 'logs',
  });

  const { data: peopleData } = useQuery({
    queryKey: ['admin-people'],
    queryFn: getPeople,
  });

  const { data: orgsData } = useQuery({
    queryKey: ['admin-orgs'],
    queryFn: getOrganizations,
  });

  // ── Mutations ──
  const settingsMutation = useMutation({
    mutationFn: updateAutomationSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-status'] });
    },
  });

  const scanMutation = useMutation({
    mutationFn: triggerScan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-status'] });
      queryClient.invalidateQueries({ queryKey: ['automation-queue'] });
      queryClient.invalidateQueries({ queryKey: ['automation-logs'] });
    },
  });

  const rescanMutation = useMutation({
    mutationFn: clearAndRescan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-status'] });
      queryClient.invalidateQueries({ queryKey: ['automation-queue'] });
      queryClient.invalidateQueries({ queryKey: ['automation-logs'] });
    },
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof approveQueueItem>[1] }) =>
      approveQueueItem(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-queue'] });
      queryClient.invalidateQueries({ queryKey: ['automation-status'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof rejectQueueItem>[1] }) =>
      rejectQueueItem(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-queue'] });
      queryClient.invalidateQueries({ queryKey: ['automation-status'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteQueueItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-queue'] });
    },
  });

  const settings = status?.settings;
  const people = peopleData?.data ?? [];
  const orgs = orgsData?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Zap className="w-5 h-5 text-yellow-500" />
          אוטומציה
        </h1>
        {status && (
          <div className="flex items-center gap-3 text-sm">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              status.scheduler_running ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
            }`}>
              {status.scheduler_running ? 'סורק פעיל' : 'סורק כבוי'}
            </span>
            {status.pending_count > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                {status.pending_count} ממתינים לאישור
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Settings Panel ── */}
      <SettingsPanel
        settings={settings}
        isLoading={statusLoading}
        isSaving={settingsMutation.isPending}
        isScanning={scanMutation.isPending || rescanMutation.isPending || !!status?.scan_in_progress}
        onSave={(updates) => settingsMutation.mutate(updates)}
        onScan={() => scanMutation.mutate()}
        onRescan={() => rescanMutation.mutate()}
        scanResult={scanMutation.data}
        rescanResult={rescanMutation.data}
      />

      {/* ── Flow explanation ── */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700 leading-relaxed">
        <strong>איך זה עובד?</strong> הסורק מחפש יומנים חדשים ב-ODATA.
        יומנים שעומדים בתנאי הסף (מיפוי שדות ≥ {((status?.settings?.auto_import_confidence_threshold ?? 0.9) * 100).toFixed(0)}%, זיהוי בעלים ≥ {((status?.settings?.owner_confidence_threshold ?? 0.9) * 100).toFixed(0)}%) מיובאים <strong>אוטומטית</strong>.
        יומנים שלא עומדים בתנאים מופיעים בלשונית <strong>״ממתינים לאישור״</strong> לבדיקה ידנית.
      </div>

      {/* ── Tabs ── */}
      <div className="border-b border-gray-200">
        <div className="flex gap-4">
          {[
            { key: 'pending' as const, label: 'ממתינים לאישור', count: pendingQueue?.pagination.total, countColor: 'bg-yellow-100 text-yellow-700' },
            { key: 'imported' as const, label: 'יובאו אוטומטית', count: importedQueue?.pagination.total, countColor: 'bg-green-100 text-green-700' },
            { key: 'logs' as const, label: 'יומן סריקות' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              {tab.count != null && tab.count > 0 && (
                <span className={`mr-1 px-1.5 py-0.5 text-xs rounded-full ${tab.countColor ?? 'bg-gray-100 text-gray-600'}`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab Content ── */}
      {activeTab === 'pending' && (
        <QueueTable
          items={pendingQueue?.data ?? []}
          people={people}
          orgs={orgs}
          expandedId={expandedId}
          onToggleExpand={(id) => setExpandedId(expandedId === id ? null : id)}
          onApprove={(id, body) => approveMutation.mutate({ id, body })}
          onReject={(id) => rejectMutation.mutate({ id, body: { add_exception: true } })}
          onDelete={(id) => deleteMutation.mutate(id)}
          isApproving={approveMutation.isPending}
          isRejecting={rejectMutation.isPending}
          showActions
          emptyMessage="אין יומנים ממתינים לאישור. כל היומנים שנמצאו עמדו בתנאי הסף ויובאו אוטומטית."
        />
      )}

      {activeTab === 'imported' && (
        <QueueTable
          items={importedQueue?.data ?? []}
          people={people}
          orgs={orgs}
          expandedId={expandedId}
          onToggleExpand={(id) => setExpandedId(expandedId === id ? null : id)}
          onApprove={(id, body) => approveMutation.mutate({ id, body })}
          onReject={(id) => rejectMutation.mutate({ id, body: { add_exception: true } })}
          onDelete={(id) => deleteMutation.mutate(id)}
          isApproving={approveMutation.isPending}
          isRejecting={rejectMutation.isPending}
          emptyMessage="עדיין לא יובאו יומנים אוטומטית. הפעל סריקה כדי לגלות יומנים חדשים."
        />
      )}

      {activeTab === 'logs' && <LogsTable logs={logs?.data ?? []} />}
    </div>
  );
}

// ──────────────────────────────────────────────
// Settings Panel
// ──────────────────────────────────────────────

function SettingsPanel({
  settings,
  isLoading,
  isSaving,
  isScanning,
  onSave,
  onScan,
  onRescan,
  scanResult,
  rescanResult,
}: {
  settings: AutomationSettings | undefined;
  isLoading: boolean;
  isSaving: boolean;
  isScanning: boolean;
  onSave: (updates: Record<string, unknown>) => void;
  onScan: () => void;
  onRescan: () => void;
  scanResult?: { resourcesNew: number; resourcesAutoImported: number; resourcesQueued: number; errors: string[] } | null;
  rescanResult?: { cleared: number; scan: { resourcesNew: number; resourcesAutoImported: number; resourcesQueued: number; errors: string[] } } | null;
}) {
  if (isLoading || !settings) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  const s = settings;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6">
      <div className="flex items-center gap-2 mb-4">
        <Settings className="w-4 h-4 text-gray-500" />
        <h2 className="text-sm font-semibold text-gray-700">הגדרות סריקה</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Auto-scan toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={s.auto_scan_enabled}
            onChange={(e) => onSave({ auto_scan_enabled: e.target.checked })}
            disabled={isSaving}
            className="rounded border-gray-300 text-primary-500"
          />
          <span className="text-sm text-gray-700">סריקה אוטומטית</span>
        </label>

        {/* Interval */}
        <div>
          <label className="text-xs text-gray-500 block mb-1">תדירות סריקה</label>
          <select
            value={s.auto_scan_interval_hours}
            onChange={(e) => onSave({ auto_scan_interval_hours: Number(e.target.value) })}
            disabled={isSaving}
            className="w-full text-sm border border-gray-200 rounded-md px-2 py-1.5"
          >
            <option value={6}>כל 6 שעות</option>
            <option value={12}>כל 12 שעות</option>
            <option value={24}>כל 24 שעות</option>
            <option value={48}>כל 48 שעות</option>
          </select>
        </div>

        {/* Mapping threshold */}
        <div>
          <label className="text-xs text-gray-500 block mb-1">סף מיפוי ({((s.auto_import_confidence_threshold) * 100).toFixed(0)}%)</label>
          <input
            type="range"
            min={50}
            max={100}
            step={5}
            value={(s.auto_import_confidence_threshold) * 100}
            onChange={(e) => onSave({ auto_import_confidence_threshold: Number(e.target.value) / 100 })}
            disabled={isSaving}
            className="w-full"
          />
        </div>

        {/* Owner threshold */}
        <div>
          <label className="text-xs text-gray-500 block mb-1">סף זיהוי בעלים ({((s.owner_confidence_threshold) * 100).toFixed(0)}%)</label>
          <input
            type="range"
            min={50}
            max={100}
            step={5}
            value={(s.owner_confidence_threshold) * 100}
            onChange={(e) => onSave({ owner_confidence_threshold: Number(e.target.value) / 100 })}
            disabled={isSaving}
            className="w-full"
          />
        </div>
      </div>

      {/* Manual scan */}
      <div className="mt-4 flex items-center gap-3 flex-wrap">
        <button
          onClick={onScan}
          disabled={isScanning}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50 transition-colors"
        >
          {isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          {isScanning ? 'סורק...' : 'סריקה רגילה'}
        </button>

        <button
          onClick={onRescan}
          disabled={isScanning}
          className="flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-lg text-sm hover:bg-yellow-700 disabled:opacity-50 transition-colors"
          title="מוחק את כל הפריטים בסטטוס ממתין/שגיאה וסורק מחדש — מועיל אחרי שינוי קוד"
        >
          {isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {isScanning ? 'סורק...' : 'נקה וסרוק מחדש'}
        </button>

        {scanResult && (
          <span className="text-xs text-gray-500">
            נסרקו {scanResult.resourcesNew} חדשים —
            {scanResult.resourcesAutoImported > 0 && ` ${scanResult.resourcesAutoImported} יובאו,`}
            {scanResult.resourcesQueued > 0 && ` ${scanResult.resourcesQueued} בתור,`}
            {scanResult.errors.length > 0 && ` ${scanResult.errors.length} שגיאות`}
          </span>
        )}

        {rescanResult && (
          <span className="text-xs text-gray-500">
            נוקו {rescanResult.cleared} פריטים, נסרקו {rescanResult.scan.resourcesNew} חדשים —
            {rescanResult.scan.resourcesAutoImported > 0 && ` ${rescanResult.scan.resourcesAutoImported} יובאו,`}
            {rescanResult.scan.resourcesQueued > 0 && ` ${rescanResult.scan.resourcesQueued} בתור,`}
            {rescanResult.scan.errors.length > 0 && ` ${rescanResult.scan.errors.length} שגיאות`}
          </span>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Queue Table
// ──────────────────────────────────────────────

function QueueTable({
  items,
  people,
  orgs,
  expandedId,
  onToggleExpand,
  onApprove,
  onReject,
  onDelete,
  isApproving,
  isRejecting,
  showActions,
  emptyMessage,
}: {
  items: QueueItem[];
  people: Array<{ id: string; name: string; organization_id?: string | null }>;
  orgs: Array<{ id: string; name: string }>;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  onApprove: (id: string, body: Parameters<typeof approveQueueItem>[1]) => void;
  onReject: (id: string) => void;
  onDelete: (id: string) => void;
  isApproving: boolean;
  isRejecting: boolean;
  showActions?: boolean;
  emptyMessage?: string;
}) {
  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 text-sm">
        {emptyMessage ?? 'אין פריטים להצגה'}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <QueueRow
          key={item.id}
          item={item}
          people={people}
          orgs={orgs}
          isExpanded={expandedId === item.id}
          onToggle={() => onToggleExpand(item.id)}
          onApprove={(body) => onApprove(item.id, body)}
          onReject={() => onReject(item.id)}
          onDelete={() => onDelete(item.id)}
          isApproving={isApproving}
          isRejecting={isRejecting}
          showActions={showActions}
        />
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────
// Queue Row (collapsible)
// ──────────────────────────────────────────────

function QueueRow({
  item,
  people,
  orgs,
  isExpanded,
  onToggle,
  onApprove,
  onReject,
  onDelete,
  isApproving,
  isRejecting,
  showActions,
}: {
  item: QueueItem;
  people: Array<{ id: string; name: string; organization_id?: string | null }>;
  orgs: Array<{ id: string; name: string }>;
  isExpanded: boolean;
  onToggle: () => void;
  onApprove: (body: Parameters<typeof approveQueueItem>[1]) => void;
  onReject: () => void;
  onDelete: () => void;
  isApproving: boolean;
  isRejecting: boolean;
  showActions?: boolean;
}) {
  const statusInfo = STATUS_LABELS[item.status] ?? STATUS_LABELS.pending;
  const StatusIcon = statusInfo.icon;
  const fieldScore = calcFieldScore(item.suggested_mapping as unknown as Record<string, string | undefined>);

  // Approve form state
  const [approveName, setApproveName] = useState(item.suggested_name);
  const [approveColor, setApproveColor] = useState(item.suggested_color);
  const [approvePersonId, setApprovePersonId] = useState(item.suggested_person_id ?? '');
  const [approveOrgId, setApproveOrgId] = useState(item.suggested_org_id ?? '');
  const [approveMapping, setApproveMapping] = useState<FieldMapping>(
    item.suggested_mapping || { title: '', start_date: '' }
  );

  const confidenceColor = (c: number) =>
    c >= 0.9 ? 'text-green-600' : c >= 0.7 ? 'text-yellow-600' : 'text-red-600';

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-right"
      >
        {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-900 truncate">{item.dataset_title}</span>
            <span className="text-xs text-gray-400">{item.resource_format}</span>
            <span className="text-xs text-gray-400">({item.total_records} רשומות)</span>
          </div>
          {item.resource_name && (
            <div className="text-xs text-gray-500 truncate">{item.resource_name}</div>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0 flex-wrap justify-end">
          {/* Field recognition score */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-gray-400">שדות:</span>
            <div className="flex gap-0.5">
              {SCORE_FIELDS.map((f) => (
                <span
                  key={f.key}
                  title={`${f.label}: ${fieldScore.fields[f.key] ? 'זוהה' : 'לא זוהה'}`}
                  className={`w-2.5 h-2.5 rounded-sm ${
                    fieldScore.fields[f.key]
                      ? 'bg-green-500'
                      : f.required ? 'bg-red-300' : 'bg-gray-200'
                  }`}
                />
              ))}
            </div>
            <span className={`text-xs font-medium ${
              fieldScore.mapped >= 5 ? 'text-green-600' : fieldScore.mapped >= 3 ? 'text-yellow-600' : 'text-red-600'
            }`}>
              {fieldScore.mapped}/{fieldScore.total}
            </span>
          </div>

          {/* Owner recognition score */}
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
            item.person_confidence >= 0.9
              ? 'bg-green-50 text-green-700'
              : item.person_confidence >= 0.5
                ? 'bg-yellow-50 text-yellow-700'
                : 'bg-red-50 text-red-600'
          }`}>
            <span>{item.suggested_person_name || 'לא זוהה'}</span>
            <span className="opacity-60">{(item.person_confidence * 100).toFixed(0)}%</span>
          </div>

          {/* Status */}
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}>
            <StatusIcon className="w-3 h-3" />
            {statusInfo.label}
          </span>
        </div>
      </button>

      {/* Expanded details */}
      {isExpanded && (
        <div className="border-t border-gray-100 px-4 py-4 space-y-4">
          {/* Info grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-gray-400 block">ארגון</span>
              <span className="text-gray-700">{item.organization || '—'}</span>
            </div>
            <div>
              <span className="text-gray-400 block">תאריך גילוי</span>
              <span className="text-gray-700">{new Date(item.discovered_at).toLocaleDateString('he-IL')}</span>
            </div>
            <div>
              <span className="text-gray-400 block">שיטת מיפוי</span>
              <span className="text-gray-700">{item.mapping_method}</span>
            </div>
            <div>
              <a
                href={item.odata_resource_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 hover:underline inline-flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" />
                צפה ב-ODATA
              </a>
            </div>
          </div>

          {/* Score breakdown */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Field recognition breakdown */}
            <div className="bg-gray-50 rounded-lg p-3">
              <h4 className="text-xs font-semibold text-gray-600 mb-2 flex items-center justify-between">
                <span>זיהוי שדות</span>
                <span className={`text-xs font-bold ${
                  fieldScore.mapped >= 5 ? 'text-green-600' : fieldScore.mapped >= 3 ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  {fieldScore.mapped}/{fieldScore.total}
                </span>
              </h4>
              <div className="space-y-1">
                {SCORE_FIELDS.map((f) => {
                  const mapped = fieldScore.fields[f.key];
                  const mappedTo = (item.suggested_mapping as unknown as Record<string, string | undefined>)?.[f.key];
                  return (
                    <div key={f.key} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-4 h-4 rounded-full flex items-center justify-center text-white text-[10px] ${
                          mapped ? 'bg-green-500' : f.required ? 'bg-red-400' : 'bg-gray-300'
                        }`}>
                          {mapped ? '✓' : '✗'}
                        </span>
                        <span className={`${mapped ? 'text-gray-700' : 'text-gray-400'} ${f.required ? 'font-medium' : ''}`}>
                          {f.label}
                          {f.required && <span className="text-red-400 mr-0.5">*</span>}
                        </span>
                      </div>
                      {mapped && mappedTo && (
                        <span className="text-gray-400 text-[10px] font-mono bg-white px-1.5 py-0.5 rounded border border-gray-200 truncate max-w-[120px]">
                          {mappedTo}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* Confidence bar */}
              <div className="mt-2 pt-2 border-t border-gray-200">
                <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1">
                  <span>ביטחון מיפוי</span>
                  <span className={`font-medium ${confidenceColor(item.mapping_confidence)}`}>
                    {(item.mapping_confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all ${
                      item.mapping_confidence >= 0.9 ? 'bg-green-500'
                        : item.mapping_confidence >= 0.7 ? 'bg-yellow-500'
                          : 'bg-red-400'
                    }`}
                    style={{ width: `${Math.min(item.mapping_confidence * 100, 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Owner recognition breakdown */}
            <div className="bg-gray-50 rounded-lg p-3">
              <h4 className="text-xs font-semibold text-gray-600 mb-2">זיהוי בעלים</h4>
              <div className="space-y-2">
                {/* Person */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">אדם:</span>
                  <div className="flex items-center gap-1.5">
                    {item.suggested_person_name ? (
                      <>
                        <span className="text-xs font-medium text-gray-800">{item.suggested_person_name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          item.person_confidence >= 0.9
                            ? 'bg-green-100 text-green-700'
                            : item.person_confidence >= 0.5
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-red-100 text-red-600'
                        }`}>
                          {(item.person_confidence * 100).toFixed(0)}%
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-red-400">לא זוהה</span>
                    )}
                  </div>
                </div>

                {/* Organization */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">ארגון:</span>
                  <div className="flex items-center gap-1.5">
                    {item.suggested_org_name ? (
                      <>
                        <span className="text-xs font-medium text-gray-800">{item.suggested_org_name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          item.org_confidence >= 0.9
                            ? 'bg-green-100 text-green-700'
                            : item.org_confidence >= 0.5
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-red-100 text-red-600'
                        }`}>
                          {(item.org_confidence * 100).toFixed(0)}%
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-gray-400">{item.organization || 'לא זוהה'}</span>
                    )}
                  </div>
                </div>

                {/* Person confidence bar */}
                <div className="pt-2 border-t border-gray-200">
                  <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1">
                    <span>ביטחון זיהוי בעלים</span>
                    <span className={`font-medium ${confidenceColor(item.person_confidence)}`}>
                      {(item.person_confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${
                        item.person_confidence >= 0.9 ? 'bg-green-500'
                          : item.person_confidence >= 0.5 ? 'bg-yellow-500'
                            : 'bg-red-400'
                      }`}
                      style={{ width: `${Math.min(item.person_confidence * 100, 100)}%` }}
                    />
                  </div>
                </div>

                {/* ODATA org info */}
                {item.organization && (
                  <div className="text-[10px] text-gray-400 pt-1">
                    ארגון ב-ODATA: {item.organization}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Mapping issues */}
          {item.mapping_issues && item.mapping_issues.length > 0 && (
            <div className="bg-yellow-50 rounded-md p-3">
              <h4 className="text-xs font-medium text-yellow-800 mb-1 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                בעיות מיפוי
              </h4>
              <ul className="text-xs text-yellow-700 space-y-0.5">
                {item.mapping_issues.map((issue, i) => (
                  <li key={i}>• {issue}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Failure reason */}
          {item.failure_reason && (
            <div className="bg-red-50 rounded-md p-3">
              <span className="text-xs text-red-700">{item.failure_reason}</span>
            </div>
          )}

          {/* Fields */}
          {item.fields && item.fields.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-gray-500 mb-1">שדות</h4>
              <div className="flex flex-wrap gap-1">
                {item.fields.map((f) => (
                  <span key={f} className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600">{f}</span>
                ))}
              </div>
            </div>
          )}

          {/* Sample records */}
          {item.sample_records && item.sample_records.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-gray-500 mb-1">רשומות לדוגמה</h4>
              <div className="overflow-x-auto">
                <table className="text-xs border-collapse w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      {Object.keys(item.sample_records[0]).filter(k => k !== '_id').map((key) => (
                        <th key={key} className="border border-gray-200 px-2 py-1 text-right font-medium text-gray-600">
                          {key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {item.sample_records.map((record, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        {Object.entries(record).filter(([k]) => k !== '_id').map(([key, val]) => (
                          <td key={key} className="border border-gray-200 px-2 py-1 text-gray-700 max-w-[200px] truncate">
                            {val != null ? String(val) : ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Actions for pending/error items */}
          {showActions && (item.status === 'pending' || item.status === 'error') && (
            <div className="border-t border-gray-100 pt-4 space-y-3">
              <h4 className="text-xs font-semibold text-gray-700">אישור ייבוא</h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Name */}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">שם</label>
                  <input
                    type="text"
                    value={approveName}
                    onChange={(e) => setApproveName(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-md px-2 py-1.5"
                  />
                </div>

                {/* Color */}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">צבע</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={approveColor}
                      onChange={(e) => setApproveColor(e.target.value)}
                      className="w-8 h-8 border border-gray-200 rounded cursor-pointer"
                    />
                    <div className="flex gap-1">
                      {SOURCE_COLORS.slice(0, 6).map((c) => (
                        <button
                          key={c}
                          onClick={() => setApproveColor(c)}
                          className={`w-5 h-5 rounded-full border-2 ${approveColor === c ? 'border-gray-600' : 'border-transparent'}`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Person */}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">בעלים (אישי)</label>
                  <select
                    value={approvePersonId}
                    onChange={(e) => setApprovePersonId(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-md px-2 py-1.5"
                  >
                    <option value="">— ללא —</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                {/* Organization */}
                <div>
                  <label className="text-xs text-gray-500 block mb-1">ארגון</label>
                  <select
                    value={approveOrgId}
                    onChange={(e) => setApproveOrgId(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-md px-2 py-1.5"
                  >
                    <option value="">— ללא —</option>
                    {orgs.map((o) => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Field mapping editor */}
              <div>
                <label className="text-xs text-gray-500 block mb-1">מיפוי שדות</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(['title', 'start_date', 'start_time', 'end_date', 'end_time', 'location', 'participants'] as const).map((field) => (
                    <div key={field}>
                      <span className="text-[10px] text-gray-400">{field}</span>
                      <select
                        value={(approveMapping as unknown as Record<string, string | undefined>)[field] ?? ''}
                        onChange={(e) => setApproveMapping({ ...approveMapping, [field]: e.target.value || undefined })}
                        className="w-full text-xs border border-gray-200 rounded px-1 py-1"
                      >
                        <option value="">—</option>
                        {(item.fields ?? []).map((f) => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onApprove({
                    name: approveName,
                    color: approveColor,
                    field_mapping: approveMapping,
                    person_id: approvePersonId || null,
                    organization_id: approveOrgId || null,
                  })}
                  disabled={isApproving || !approveName || !approveMapping.title || !approveMapping.start_date}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {isApproving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                  אשר וייבא
                </button>
                <button
                  onClick={onReject}
                  disabled={isRejecting}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-md text-sm hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {isRejecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                  דחה
                </button>
                <button
                  onClick={onDelete}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-600 rounded-md text-sm hover:bg-gray-50 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  הסר
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Logs Table
// ──────────────────────────────────────────────

function LogsTable({ logs }: { logs: Array<{
  id: string;
  scan_started_at: string;
  scan_completed_at: string | null;
  resources_discovered: number;
  resources_new: number;
  resources_auto_imported: number;
  resources_queued: number;
  resources_skipped: number;
  errors: string[] | null;
  duration_ms: number | null;
}> }) {
  if (logs.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 text-sm">
        אין סריקות קודמות
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-right">
            <th className="px-3 py-2 text-xs font-medium text-gray-500">תאריך</th>
            <th className="px-3 py-2 text-xs font-medium text-gray-500">משך</th>
            <th className="px-3 py-2 text-xs font-medium text-gray-500">נסרקו</th>
            <th className="px-3 py-2 text-xs font-medium text-gray-500">חדשים</th>
            <th className="px-3 py-2 text-xs font-medium text-gray-500">יובאו</th>
            <th className="px-3 py-2 text-xs font-medium text-gray-500">בתור</th>
            <th className="px-3 py-2 text-xs font-medium text-gray-500">שגיאות</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {logs.map((log) => (
            <tr key={log.id} className="hover:bg-gray-50">
              <td className="px-3 py-2 text-gray-700">
                {new Date(log.scan_started_at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}
              </td>
              <td className="px-3 py-2 text-gray-500">
                {log.duration_ms ? `${(log.duration_ms / 1000).toFixed(1)}s` : '—'}
              </td>
              <td className="px-3 py-2 text-gray-700">{log.resources_discovered}</td>
              <td className="px-3 py-2 text-gray-700">{log.resources_new}</td>
              <td className="px-3 py-2">
                <span className={log.resources_auto_imported > 0 ? 'text-green-600 font-medium' : 'text-gray-500'}>
                  {log.resources_auto_imported}
                </span>
              </td>
              <td className="px-3 py-2">
                <span className={log.resources_queued > 0 ? 'text-yellow-600 font-medium' : 'text-gray-500'}>
                  {log.resources_queued}
                </span>
              </td>
              <td className="px-3 py-2">
                <span className={log.errors && log.errors.length > 0 ? 'text-red-600 font-medium' : 'text-gray-500'}>
                  {log.errors?.length ?? 0}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
