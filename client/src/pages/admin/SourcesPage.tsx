import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAdminSources,
  deleteSource,
  resyncSource,
  updateSource,
  deduplicateSource,
  getSyncStatus,
  triggerEntityExtraction,
  getSourceEntities,
  renameEntity,
  mergeEntities,
  bulkRenameEntity,
  getPeople,
  type SyncStatusResponse,
  type EntityListResponse,
  type EntityItem,
} from '@/api/admin';
import type { DiarySource } from '@/api/sources';
import {
  Database,
  RefreshCw,
  Trash2,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  ExternalLink,
  Sparkles,
  Users,
  Pencil,
  Merge,
  Check,
  X,
  Copy,
  UserCircle,
  Save,
} from 'lucide-react';
import { formatDateShort } from '@/lib/formatters';

export function SourcesPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['admin-sources'],
    queryFn: getAdminSources,
  });

  const sources = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">ניהול מקורות</h1>
        <span className="text-xs sm:text-sm text-gray-500">{sources.length} מקורות</span>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        </div>
      ) : sources.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <Database className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">אין מקורות עדיין.</p>
          <p className="text-sm text-gray-400 mt-1">עבור לעמוד הייבוא כדי לייבא יומנים.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sources.map((source) => (
            <SourceCard key={source.id} source={source} />
          ))}
        </div>
      )}
    </div>
  );
}

function SourceCard({ source }: { source: DiarySource }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatusResponse | null>(null);
  const [showEntities, setShowEntities] = useState(true);
  const [entityPage, setEntityPage] = useState(1);
  const [entityType, setEntityType] = useState('');
  const [extractionMsg, setExtractionMsg] = useState('');
  const [dedupMsg, setDedupMsg] = useState('');
  // בעל היומן — person_id editor
  const [selectedPersonId, setSelectedPersonId] = useState<string>(source.person_id ?? '');

  const id = source.id;
  const name = source.name;
  const color = source.color;
  const isEnabled = source.is_enabled;
  const syncStatusStr = source.sync_status;
  const totalEvents = source.total_events || 0;
  const lastSync = source.last_sync_at;
  const syncError = source.sync_error;

  // Fetch people registry for the person selector
  const { data: peopleData } = useQuery({
    queryKey: ['admin-people'],
    queryFn: getPeople,
    staleTime: 5 * 60 * 1000,
  });
  const people = peopleData?.data ?? [];

  const resyncMut = useMutation({
    mutationFn: () => resyncSource(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-sources'] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteSource(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-sources'] });
      queryClient.invalidateQueries({ queryKey: ['sources'] });
    },
  });

  const toggleMut = useMutation({
    mutationFn: () => updateSource(id, { is_enabled: !isEnabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-sources'] });
      queryClient.invalidateQueries({ queryKey: ['sources'] });
    },
  });

  const updatePersonMut = useMutation({
    mutationFn: (personId: string | null) => updateSource(id, { person_id: personId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-sources'] });
    },
  });

  const dedupMut = useMutation({
    mutationFn: () => deduplicateSource(id),
    onSuccess: (data) => {
      setDedupMsg(data.message);
      setTimeout(() => setDedupMsg(''), 6000);
      queryClient.invalidateQueries({ queryKey: ['admin-sources'] });
    },
    onError: (err: Error) => {
      setDedupMsg(`שגיאה: ${err.message}`);
      setTimeout(() => setDedupMsg(''), 6000);
    },
  });

  const checkStatusMut = useMutation({
    mutationFn: () => getSyncStatus(id),
    onSuccess: (data) => setSyncStatus(data),
  });

  const extractMut = useMutation({
    mutationFn: (opts: { skip_ai: boolean; clear_existing?: boolean }) =>
      triggerEntityExtraction(id, opts),
    onSuccess: (data) => {
      setExtractionMsg(data.message);
      setTimeout(() => setExtractionMsg(''), 8000);
      setShowEntities(true); // auto-open entity list after extraction
      queryClient.invalidateQueries({ queryKey: ['entities', id] });
    },
    onError: (err: Error) => {
      setExtractionMsg(`שגיאה: ${err.message}`);
      setTimeout(() => setExtractionMsg(''), 8000);
    },
  });

  // Entity list query (only runs when showEntities is true)
  const { data: entitiesData, isLoading: entitiesLoading } = useQuery({
    queryKey: ['entities', id, entityPage, entityType],
    queryFn: () => getSourceEntities(id, { page: entityPage, limit: 50, type: entityType || undefined }),
    enabled: showEntities && expanded,
    staleTime: 30 * 1000,
  });

  const handleExpand = () => {
    if (!expanded) checkStatusMut.mutate();
    setExpanded(!expanded);
    if (expanded) setShowEntities(false);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Summary row */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <span className="text-xs sm:text-sm font-medium text-gray-800 truncate">{name}</span>
          {source.person_name && (
            <span className="text-[10px] sm:text-xs text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded hidden sm:inline">
              {source.person_name}
            </span>
          )}
          <SyncStatusBadge status={syncStatusStr} />
          <span className="text-[10px] sm:text-xs text-gray-400 hidden sm:inline">{totalEvents} אירועים</span>
        </div>

        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          <button
            onClick={() => toggleMut.mutate()}
            disabled={toggleMut.isPending}
            className="p-1.5 rounded hover:bg-gray-100 transition-colors"
            title={isEnabled ? 'השבת' : 'הפעל'}
          >
            {isEnabled ? <Eye className="w-4 h-4 text-green-500" /> : <EyeOff className="w-4 h-4 text-gray-400" />}
          </button>
          <button
            onClick={() => resyncMut.mutate()}
            disabled={resyncMut.isPending || syncStatusStr === 'syncing'}
            className="p-1.5 rounded hover:bg-gray-100 transition-colors"
            title="סנכרון מחדש"
          >
            {resyncMut.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin text-primary-500" />
            ) : (
              <RefreshCw className="w-4 h-4 text-gray-500" />
            )}
          </button>
          <button
            onClick={() => {
              if (confirm(`למחוק את "${name}" וכל ${totalEvents} האירועים שלו?`)) {
                deleteMut.mutate();
              }
            }}
            disabled={deleteMut.isPending}
            className="p-1.5 rounded hover:bg-red-50 transition-colors"
            title="מחיקה"
          >
            <Trash2 className="w-4 h-4 text-red-400" />
          </button>
          <button
            onClick={handleExpand}
            className="p-1.5 rounded hover:bg-gray-100 transition-colors"
          >
            {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/50 text-sm space-y-4">
          {syncError && (
            <div className="bg-red-50 text-red-700 rounded p-2 text-xs">
              <AlertTriangle className="w-3 h-3 inline mr-1" />
              {syncError}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <DetailItem label="סנכרון אחרון" value={lastSync ? formatDateShort(lastSync) : 'לא סונכרן'} />
            <DetailItem label="סטטוס" value={syncStatusStr} />
            <DetailItem label="אירועים" value={String(totalEvents)} />
            <DetailItem label="מופעל" value={isEnabled ? 'כן' : 'לא'} />
          </div>

          {/* ── בעל היומן (diary owner) ── */}
          <div className="pt-3 border-t border-gray-200">
            <div className="flex items-center gap-1.5 mb-2">
              <UserCircle className="w-3.5 h-3.5 text-primary-500" />
              <span className="text-xs font-semibold text-gray-700">בעל היומן</span>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={selectedPersonId}
                onChange={(e) => setSelectedPersonId(e.target.value)}
                className="flex-1 text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary-400"
              >
                <option value="">— ללא —</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}{p.organization_name ? ` (${p.organization_name})` : ''}
                  </option>
                ))}
              </select>
              <button
                onClick={() => updatePersonMut.mutate(selectedPersonId || null)}
                disabled={updatePersonMut.isPending || selectedPersonId === (source.person_id ?? '')}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-40 transition-colors"
              >
                {updatePersonMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                שמור
              </button>
            </div>
          </div>

          {/* ── כפילויות — deduplicate ── */}
          <div className="pt-3 border-t border-gray-200 flex items-center gap-3 flex-wrap">
            <span className="text-xs font-semibold text-gray-700 flex items-center gap-1">
              <Copy className="w-3.5 h-3.5 text-gray-400" />
              כפילויות
            </span>
            <button
              onClick={() => {
                if (confirm('הסרת אירועים כפולים (אותו כותרת + שעת התחלה) ממקור זה. להמשיך?')) {
                  dedupMut.mutate();
                }
              }}
              disabled={dedupMut.isPending}
              className="px-2.5 py-1 text-xs bg-orange-50 text-orange-700 border border-orange-200 rounded-lg hover:bg-orange-100 disabled:opacity-50 flex items-center gap-1"
            >
              {dedupMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Copy className="w-3 h-3" />}
              הסר כפילויות
            </button>
            {dedupMsg && (
              <span className={`text-xs ${dedupMsg.startsWith('שגיאה') ? 'text-red-600' : 'text-green-600'}`}>
                {dedupMsg}
              </span>
            )}
          </div>

          {/* ODATA links */}
          {(source.ckan_metadata || source.dataset_url) && (
            <div className="pt-3 border-t border-gray-200">
              <div className="text-xs font-medium text-gray-500 mb-1.5">ODATA:</div>
              <div className="space-y-1.5">
                {source.ckan_metadata?.datasetTitle && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-gray-400">דאטסט:</span>
                    {source.dataset_url ? (
                      <a href={source.dataset_url} target="_blank" rel="noopener noreferrer"
                        className="text-primary-600 hover:underline flex items-center gap-1 truncate">
                        {source.ckan_metadata.datasetTitle}
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    ) : (
                      <span className="text-gray-700 truncate">{source.ckan_metadata.datasetTitle}</span>
                    )}
                  </div>
                )}
                {source.ckan_metadata?.resourceName && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-gray-400">משאב:</span>
                    {source.resource_url ? (
                      <a href={source.resource_url} target="_blank" rel="noopener noreferrer"
                        className="text-primary-600 hover:underline flex items-center gap-1 truncate">
                        {source.ckan_metadata.resourceName}
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    ) : (
                      <span className="text-gray-700 truncate">{source.ckan_metadata.resourceName}</span>
                    )}
                  </div>
                )}
                {source.ckan_metadata?.organization && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-gray-400">ארגון:</span>
                    <span className="text-gray-700">{source.ckan_metadata.organization}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {syncStatus?.latest_sync_log && (
            <div className="pt-3 border-t border-gray-200">
              <div className="text-xs font-medium text-gray-500 mb-1">סנכרון אחרון:</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <DetailItem label="רשומות שנקראו" value={String(syncStatus.latest_sync_log.records_fetched)} />
                <DetailItem label="רשומות שנוצרו" value={String(syncStatus.latest_sync_log.records_created)} />
                <DetailItem label="רשומות שדולגו" value={String(syncStatus.latest_sync_log.records_skipped)} />
                <DetailItem label="משך" value={`${((syncStatus.latest_sync_log.duration_ms || 0) / 1000).toFixed(1)}s`} />
              </div>
            </div>
          )}

          {/* ── Entity extraction section ── */}
          <div className="pt-3 border-t border-gray-200">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-gray-700 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                כריית ישויות
              </span>
              <button
                onClick={() => extractMut.mutate({ skip_ai: true })}
                disabled={extractMut.isPending}
                className="px-2.5 py-1 text-xs bg-primary-50 text-primary-700 border border-primary-200 rounded-lg hover:bg-primary-100 disabled:opacity-50 flex items-center gap-1"
                title="כרה ישויות ללא בינה מלאכותית (שלבים 1-2)"
              >
                {extractMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Users className="w-3 h-3" />}
                כרה (ללא AI)
              </button>
              <button
                onClick={() => extractMut.mutate({ skip_ai: false })}
                disabled={extractMut.isPending}
                className="px-2.5 py-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-50 flex items-center gap-1"
                title="כרה ישויות כולל AI NER (שלבים 1-3, עלות API)"
              >
                {extractMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                כרה עם AI
              </button>
              <button
                onClick={() => { setShowEntities(!showEntities); setEntityPage(1); }}
                className="px-2.5 py-1 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 flex items-center gap-1"
              >
                {showEntities ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                הצג ישויות
              </button>
              {extractionMsg && (
                <span className={`text-xs flex items-start gap-1 whitespace-pre-line ${
                  extractionMsg.startsWith('שגיאה') || extractionMsg.includes('API')
                    ? 'text-red-600' : extractionMsg.startsWith('לא נמצאו')
                    ? 'text-amber-600' : 'text-green-600'
                }`}>
                  {extractionMsg.startsWith('שגיאה') || extractionMsg.includes('API')
                    ? <XCircle className="w-3 h-3 mt-0.5 shrink-0" />
                    : extractionMsg.startsWith('לא נמצאו')
                    ? <XCircle className="w-3 h-3 mt-0.5 shrink-0" />
                    : <CheckCircle className="w-3 h-3 mt-0.5 shrink-0" />}
                  {extractionMsg}
                </span>
              )}
            </div>

            {/* Entity stats bar */}
            {entitiesData && !entitiesLoading && entitiesData.stats.total > 0 && (
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                <span>👤 {entitiesData.stats.by_type.person} אנשים</span>
                <span>🏢 {entitiesData.stats.by_type.organization} ארגונות</span>
                <span>📍 {entitiesData.stats.by_type.place} מקומות</span>
                <span className="text-green-600">● {entitiesData.stats.matched} מזוהים</span>
                <span className="text-gray-400">○ {entitiesData.stats.unmatched} לא מזוהים</span>
              </div>
            )}

            {/* Entity list */}
            {showEntities && (
              <EntityTable
                sourceId={id}
                data={entitiesData}
                isLoading={entitiesLoading}
                entityType={entityType}
                onTypeChange={(t) => { setEntityType(t); setEntityPage(1); }}
                page={entityPage}
                onPageChange={setEntityPage}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Entity table sub-component
// ─────────────────────────────────────────────
function EntityTable({
  sourceId,
  data,
  isLoading,
  entityType,
  onTypeChange,
  page,
  onPageChange,
}: {
  sourceId: string;
  data: EntityListResponse | undefined;
  isLoading: boolean;
  entityType: string;
  onTypeChange: (t: string) => void;
  page: number;
  onPageChange: (p: number) => void;
}) {
  const queryClient = useQueryClient();
  const LIMIT = 50;
  const totalPages = Math.ceil((data?.total ?? 0) / LIMIT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [mergeSelection, setMergeSelection] = useState<Set<string>>(new Set());
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeName, setMergeName] = useState('');

  const TYPE_LABELS: Record<string, string> = {
    '': 'הכל',
    person: 'אנשים',
    organization: 'ארגונות',
    place: 'מקומות',
  };

  const METHOD_LABELS: Record<string, string> = {
    owner: 'בעלים',
    participant_parse: 'משתתף',
    ai_ner: 'AI',
  };

  const ROLE_LABELS: Record<string, string> = {
    owner: 'בעלים',
    participant: 'משתתף',
    location: 'מיקום',
    mentioned: 'הוזכר',
  };

  const renameMut = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameEntity(id, name),
    onSuccess: () => {
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ['entities', sourceId] });
    },
  });

  const bulkRenameMut = useMutation({
    mutationFn: ({ oldName, newName, type }: { oldName: string; newName: string; type?: string }) =>
      bulkRenameEntity(oldName, newName, type),
    onSuccess: () => {
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ['entities', sourceId] });
    },
  });

  const mergeMut = useMutation({
    mutationFn: ({ ids, name }: { ids: string[]; name: string }) => mergeEntities(ids, name),
    onSuccess: () => {
      setMergeMode(false);
      setMergeSelection(new Set());
      setMergeName('');
      queryClient.invalidateQueries({ queryKey: ['entities', sourceId] });
    },
  });

  const startEdit = (entity: EntityItem) => {
    setEditingId(entity.id);
    setEditName(entity.entity_name);
  };

  const toggleMergeSelect = (id: string) => {
    setMergeSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="mt-2 space-y-2">
      {/* Type filter + merge toggle */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1">
          {Object.entries(TYPE_LABELS).map(([val, label]) => (
            <button
              key={val}
              onClick={() => onTypeChange(val)}
              className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors ${
                entityType === val
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'border-gray-200 text-gray-500 hover:bg-gray-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={() => { setMergeMode(!mergeMode); setMergeSelection(new Set()); }}
          className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors flex items-center gap-1 ${
            mergeMode ? 'bg-amber-500 text-white border-amber-500' : 'border-gray-200 text-gray-500 hover:bg-gray-100'
          }`}
        >
          <Merge className="w-3 h-3" />
          {mergeMode ? 'ביטול מיזוג' : 'מיזוג'}
        </button>
      </div>

      {/* Merge bar */}
      {mergeMode && mergeSelection.size >= 2 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded p-2">
          <span className="text-xs text-amber-700">{mergeSelection.size} נבחרו</span>
          <input
            type="text"
            value={mergeName}
            onChange={(e) => setMergeName(e.target.value)}
            placeholder="שם יעד"
            className="flex-1 border border-amber-300 rounded px-2 py-0.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
          <button
            onClick={() => mergeMut.mutate({ ids: Array.from(mergeSelection), name: mergeName })}
            disabled={!mergeName.trim() || mergeMut.isPending}
            className="px-2 py-0.5 text-xs bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50 flex items-center gap-1"
          >
            {mergeMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Merge className="w-3 h-3" />}
            מזג
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin text-primary-500" />
        </div>
      ) : !data || data.data.length === 0 ? (
        <p className="text-xs text-gray-400 py-2">אין ישויות. לחץ "כרה" להתחיל חילוץ.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border border-gray-200 rounded bg-white">
              <thead className="bg-gray-50">
                <tr>
                  {mergeMode && <th className="px-1 py-1.5 border-b w-6" />}
                  <th className="px-2 py-1.5 text-right font-medium text-gray-600 border-b">שם</th>
                  <th className="px-2 py-1.5 text-right font-medium text-gray-600 border-b">סוג</th>
                  <th className="px-2 py-1.5 text-right font-medium text-gray-600 border-b">תפקיד</th>
                  <th className="px-2 py-1.5 text-right font-medium text-gray-600 border-b hidden sm:table-cell">אירוע</th>
                  <th className="px-2 py-1.5 text-right font-medium text-gray-600 border-b">שיטה</th>
                  <th className="px-2 py-1.5 text-right font-medium text-gray-600 border-b">ביטחון</th>
                  <th className="px-2 py-1.5 border-b w-8" />
                </tr>
              </thead>
              <tbody>
                {data.data.map((entity) => (
                  <tr key={entity.id} className={`border-b last:border-b-0 hover:bg-gray-50 ${mergeSelection.has(entity.id) ? 'bg-amber-50' : ''}`}>
                    {mergeMode && (
                      <td className="px-1 py-1.5">
                        <input
                          type="checkbox"
                          checked={mergeSelection.has(entity.id)}
                          onChange={() => toggleMergeSelect(entity.id)}
                          className="rounded border-gray-300 text-amber-500 focus:ring-amber-500"
                        />
                      </td>
                    )}
                    <td className="px-2 py-1.5 text-gray-800 font-medium max-w-[160px]">
                      {editingId === entity.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="flex-1 border border-primary-300 rounded px-1 py-0.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-primary-500"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') renameMut.mutate({ id: entity.id, name: editName });
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                          />
                          <button
                            onClick={() => renameMut.mutate({ id: entity.id, name: editName })}
                            disabled={renameMut.isPending}
                            className="p-0.5 text-green-600 hover:text-green-800"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button onClick={() => setEditingId(null)} className="p-0.5 text-gray-400 hover:text-gray-600">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1 truncate ${entity.entity_id ? 'text-green-700' : 'text-gray-600'}`}
                          title={entity.entity_id ? 'מזוהה ברשומות' : 'לא מזוהה'}
                        >
                          <span className="text-[8px]">{entity.entity_id ? '●' : '○'}</span>
                          {entity.entity_name}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-gray-500">
                      {entity.entity_type === 'person' ? '👤' : entity.entity_type === 'organization' ? '🏢' : '📍'}
                    </td>
                    <td className="px-2 py-1.5 text-gray-500">{ROLE_LABELS[entity.role] ?? entity.role}</td>
                    <td className="px-2 py-1.5 text-gray-500 max-w-[160px] truncate hidden sm:table-cell">
                      {entity.event_title}
                    </td>
                    <td className="px-2 py-1.5">
                      <span className={`px-1 py-0.5 rounded text-[9px] font-medium ${
                        entity.extraction_method === 'owner'
                          ? 'bg-blue-100 text-blue-700'
                          : entity.extraction_method === 'ai_ner'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {METHOD_LABELS[entity.extraction_method] ?? entity.extraction_method}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-gray-500">
                      {Math.round(entity.confidence * 100)}%
                    </td>
                    <td className="px-2 py-1.5">
                      {editingId !== entity.id && (
                        <button
                          onClick={() => startEdit(entity)}
                          className="p-0.5 text-gray-400 hover:text-primary-600"
                          title="שנה שם"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-[10px] text-gray-500">
              <span>עמוד {page}/{totalPages} — סה"כ {data.total} ישויות</span>
              <div className="flex gap-1">
                <button
                  onClick={() => onPageChange(page - 1)}
                  disabled={page <= 1}
                  className="px-2 py-0.5 border border-gray-200 rounded hover:bg-gray-100 disabled:opacity-40"
                >
                  ‹ הקודם
                </button>
                <button
                  onClick={() => onPageChange(page + 1)}
                  disabled={page >= totalPages}
                  className="px-2 py-0.5 border border-gray-200 rounded hover:bg-gray-100 disabled:opacity-40"
                >
                  הבא ›
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SyncStatusBadge({ status }: { status: string }) {
  const configs: Record<string, { icon: React.ElementType; cls: string; label: string }> = {
    completed: { icon: CheckCircle, cls: 'text-green-600 bg-green-50', label: 'הושלם' },
    syncing: { icon: Loader2, cls: 'text-blue-600 bg-blue-50', label: 'מסנכרן...' },
    failed: { icon: XCircle, cls: 'text-red-600 bg-red-50', label: 'נכשל' },
    pending: { icon: Clock, cls: 'text-gray-500 bg-gray-50', label: 'ממתין' },
  };
  const cfg = configs[status] || configs.pending;
  const Icon = cfg.icon;

  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${cfg.cls}`}>
      <Icon className={`w-3 h-3 ${status === 'syncing' ? 'animate-spin' : ''}`} />
      {cfg.label}
    </span>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[10px] text-gray-400">{label}</span>
      <div className="text-sm text-gray-700">{value}</div>
    </div>
  );
}
