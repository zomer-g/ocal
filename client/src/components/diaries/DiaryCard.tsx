import { ExternalLink, Download } from 'lucide-react';
import type { DiarySource } from '@/api/sources';
import { getSourceDownloadUrl, triggerDownload } from '@/api/download';
import { formatDateShort } from '@/lib/formatters';

interface DiaryCardProps {
  source: DiarySource;
}

export function DiaryCard({ source }: DiaryCardProps) {
  const subtitle = source.person_name ?? source.organization_name ?? null;
  const dateRange =
    source.first_event_date && source.last_event_date
      ? `${formatDateShort(source.first_event_date)} – ${formatDateShort(source.last_event_date)}`
      : null;

  const datasetUrl = source.dataset_url ?? source.ckan_metadata?.datasetUrl ?? null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div
          className="w-3 h-3 rounded-full mt-1.5 shrink-0"
          style={{ backgroundColor: source.color }}
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-gray-900" style={{ overflowWrap: 'anywhere' }}>
            {source.name}
          </h2>
          {subtitle && (
            <p className="text-sm text-primary-600 mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>

      {/* Meta */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
        <span>{source.total_events.toLocaleString('he-IL')} אירועים</span>
        {dateRange && <span>{dateRange}</span>}
        {datasetUrl && (
          <a
            href={datasetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-primary-600 hover:underline"
          >
            {(() => { try { return new URL(datasetUrl).hostname.replace(/^www\./, ''); } catch { return 'מקור'; } })()}
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      {/* Download buttons */}
      <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
        <span className="text-xs text-gray-400 ml-auto">הורד:</span>
        <button
          onClick={() => triggerDownload(getSourceDownloadUrl(source.id, 'csv'))}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary-50 text-primary-700 border border-primary-200 rounded-lg hover:bg-primary-100 transition-colors"
          title={`הורד ${source.name} כ-CSV`}
        >
          <Download className="w-3 h-3" />
          CSV
        </button>
        <button
          onClick={() => triggerDownload(getSourceDownloadUrl(source.id, 'json'))}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-50 text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
          title={`הורד ${source.name} כ-JSON`}
        >
          <Download className="w-3 h-3" />
          JSON
        </button>
      </div>
    </div>
  );
}
