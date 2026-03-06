import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAdminSources, deleteSource, resyncSource, updateSource, getSyncStatus, type SyncStatusResponse } from '@/api/admin';
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

  const id = source.id;
  const name = source.name;
  const color = source.color;
  const isEnabled = source.is_enabled;
  const syncStatusStr = source.sync_status;
  const totalEvents = source.total_events || 0;
  const lastSync = source.last_sync_at;
  const syncError = source.sync_error;

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

  const checkStatusMut = useMutation({
    mutationFn: () => getSyncStatus(id),
    onSuccess: (data) => setSyncStatus(data),
  });

  const handleExpand = () => {
    if (!expanded) checkStatusMut.mutate();
    setExpanded(!expanded);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Summary row */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <span className="text-xs sm:text-sm font-medium text-gray-800 truncate">{name}</span>
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
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/50 text-sm">
          {syncError && (
            <div className="bg-red-50 text-red-700 rounded p-2 mb-3 text-xs">
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

          {/* ODATA links */}
          {(source.ckan_metadata || source.dataset_url) && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <div className="text-xs font-medium text-gray-500 mb-1.5">ODATA:</div>
              <div className="space-y-1.5">
                {source.ckan_metadata?.datasetTitle && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-gray-400">דאטסט:</span>
                    {source.dataset_url ? (
                      <a
                        href={source.dataset_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-600 hover:underline flex items-center gap-1 truncate"
                      >
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
                      <a
                        href={source.resource_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-600 hover:underline flex items-center gap-1 truncate"
                      >
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
            <div className="mt-3 pt-3 border-t border-gray-200">
              <div className="text-xs font-medium text-gray-500 mb-1">סנכרון אחרון:</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <DetailItem label="רשומות שנקראו" value={String(syncStatus.latest_sync_log.records_fetched)} />
                <DetailItem label="רשומות שנוצרו" value={String(syncStatus.latest_sync_log.records_created)} />
                <DetailItem label="רשומות שדולגו" value={String(syncStatus.latest_sync_log.records_skipped)} />
                <DetailItem label="משך" value={`${((syncStatus.latest_sync_log.duration_ms || 0) / 1000).toFixed(1)}s`} />
              </div>
            </div>
          )}
        </div>
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
