import { useState, useMemo, memo } from 'react';
import { ChevronDown, ChevronUp, Download, ExternalLink, Search } from 'lucide-react';
import type { DiarySource } from '@/api/sources';
import { getSourceDownloadUrl, triggerDownload } from '@/api/download';
import { formatDateShort } from '@/lib/formatters';

interface DiaryTableProps {
  sources: DiarySource[];
}

const ExpandedDetails = memo(({ source }: { source: DiarySource }) => {
  const datasetUrl = source.dataset_url ?? source.ckan_metadata?.datasetUrl ?? null;
  const resourceUrl = source.resource_url ?? source.ckan_metadata?.resourceUrl ?? null;

  return (
    <tr>
      <td colSpan={6} className="bg-gray-50 px-5 py-4 border-b border-gray-200">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 text-xs">
          <div>
            <span className="text-gray-400 block mb-0.5">בעלים</span>
            <span className="text-gray-700">{source.person_name ?? '—'}</span>
          </div>
          <div>
            <span className="text-gray-400 block mb-0.5">ארגון</span>
            <span className="text-gray-700">{source.organization_name ?? '—'}</span>
          </div>
          <div>
            <span className="text-gray-400 block mb-0.5">סנכרון אחרון</span>
            <span className="text-gray-700">
              {source.last_sync_at
                ? new Date(source.last_sync_at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })
                : '—'}
            </span>
          </div>
          <div>
            <span className="text-gray-400 block mb-0.5">סטטוס סנכרון</span>
            <span className={`font-medium ${source.sync_status === 'completed' ? 'text-green-600' : source.sync_status === 'failed' ? 'text-red-600' : 'text-yellow-600'}`}>
              {source.sync_status === 'completed' ? 'הושלם' : source.sync_status === 'failed' ? 'נכשל' : source.sync_status}
            </span>
          </div>
          <div>
            <span className="text-gray-400 block mb-0.5">טווח תאריכים</span>
            <span className="text-gray-700">
              {source.first_event_date && source.last_event_date
                ? `${formatDateShort(source.first_event_date)} – ${formatDateShort(source.last_event_date)}`
                : '—'}
            </span>
          </div>
          {source.ckan_metadata?.organization && (
            <div>
              <span className="text-gray-400 block mb-0.5">ארגון CKAN</span>
              <span className="text-gray-700">{source.ckan_metadata.organization}</span>
            </div>
          )}
          {datasetUrl && (
            <div>
              <span className="text-gray-400 block mb-0.5">קישור לדאטהסט</span>
              <a
                href={datasetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 hover:underline inline-flex items-center gap-1"
              >
                {(() => { try { return new URL(datasetUrl).hostname.replace(/^www\./, ''); } catch { return 'קישור'; } })()}
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
          {resourceUrl && (
            <div>
              <span className="text-gray-400 block mb-0.5">קישור למשאב</span>
              <a
                href={resourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 hover:underline inline-flex items-center gap-1"
              >
                משאב
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
          {source.sync_error && (
            <div className="col-span-full">
              <span className="text-gray-400 block mb-0.5">שגיאת סנכרון</span>
              <span className="text-red-600">{source.sync_error}</span>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
});

export function DiaryTable({ sources }: DiaryTableProps) {
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return sources;
    const q = search.trim().toLowerCase();
    return sources.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.person_name?.toLowerCase().includes(q) ||
        s.organization_name?.toLowerCase().includes(q) ||
        s.ckan_metadata?.organization?.toLowerCase().includes(q),
    );
  }, [sources, search]);

  return (
    <div>
      {/* Search bar */}
      <div className="mb-4 relative">
        <Search className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש יומן לפי שם, בעלים או ארגון..."
          className="w-full pr-9 pl-4 py-2.5 border border-gray-200 rounded-lg text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-300"
        />
        {search && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
            {filtered.length} תוצאות
          </span>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full text-sm" dir="rtl">
          <thead>
            <tr className="bg-gray-50 text-right">
              <th className="px-4 py-3 text-xs font-medium text-gray-500 w-8" />
              <th className="px-4 py-3 text-xs font-medium text-gray-500">שם היומן</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500">אירועים</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 hidden sm:table-cell">מקור</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500">CSV</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500">JSON</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-10 text-gray-400 text-sm">
                  {search ? 'לא נמצאו יומנים התואמים לחיפוש' : 'אין יומנים להצגה'}
                </td>
              </tr>
            ) : (
              filtered.map((source) => {
                const isExpanded = expandedId === source.id;
                const datasetUrl = source.dataset_url ?? source.ckan_metadata?.datasetUrl ?? null;
                return (
                  <>
                    <tr
                      key={source.id}
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : source.id)}
                    >
                      {/* Expand toggle */}
                      <td className="px-4 py-3 text-gray-400">
                        {isExpanded
                          ? <ChevronUp className="w-4 h-4" />
                          : <ChevronDown className="w-4 h-4" />}
                      </td>

                      {/* Name + color + subtitle */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: source.color }}
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate max-w-[280px]">
                              {source.name}
                            </div>
                            {(source.person_name || source.organization_name) && (
                              <div className="text-xs text-gray-500 truncate">
                                {source.person_name ?? source.organization_name}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Events count */}
                      <td className="px-4 py-3 text-gray-700 tabular-nums">
                        {source.total_events.toLocaleString('he-IL')}
                      </td>

                      {/* Source link */}
                      <td className="px-4 py-3 hidden sm:table-cell">
                        {datasetUrl ? (
                          <a
                            href={datasetUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary-600 hover:underline inline-flex items-center gap-1 text-xs"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="w-3 h-3" />
                            מקור
                          </a>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>

                      {/* CSV download */}
                      <td className="px-4 py-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            triggerDownload(getSourceDownloadUrl(source.id, 'csv'));
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-primary-50 text-primary-700 border border-primary-200 rounded hover:bg-primary-100 transition-colors"
                          title={`הורד ${source.name} כ-CSV`}
                        >
                          <Download className="w-3 h-3" />
                          CSV
                        </button>
                      </td>

                      {/* JSON download */}
                      <td className="px-4 py-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            triggerDownload(getSourceDownloadUrl(source.id, 'json'));
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-gray-50 text-gray-600 border border-gray-200 rounded hover:bg-gray-100 transition-colors"
                          title={`הורד ${source.name} כ-JSON`}
                        >
                          <Download className="w-3 h-3" />
                          JSON
                        </button>
                      </td>
                    </tr>

                    {/* Expanded row */}
                    {isExpanded && (
                      <ExpandedDetails key={`${source.id}-expand`} source={source} />
                    )}
                  </>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer count */}
      <p className="text-xs text-gray-400 mt-2 text-left">
        {filtered.length === sources.length
          ? `${sources.length} יומנים`
          : `${filtered.length} מתוך ${sources.length} יומנים`}
      </p>
    </div>
  );
}
