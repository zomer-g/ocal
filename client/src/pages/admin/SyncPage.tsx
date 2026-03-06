import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  discoverDatasets,
  profileResource,
  importResource,
  type DiscoveredDataset,
  type ProfileResponse,
  type FieldMapping,
} from '@/api/admin';
import {
  Search,
  Loader2,
  Database,
  FileSpreadsheet,
  Calendar,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

// ────────────────────────────────────────────
// Color palette for new sources
// ────────────────────────────────────────────
const SOURCE_COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316', '#6366F1', '#14B8A6',
  '#84CC16', '#E11D48', '#0EA5E9', '#A855F7', '#D946EF',
];

export function SyncPage() {
  const [searchQuery, setSearchQuery] = useState('יומן');
  const [hideConverted, setHideConverted] = useState(true);
  const [activeProfile, setActiveProfile] = useState<ProfileResponse | null>(null);
  const [importName, setImportName] = useState('');
  const [importColor, setImportColor] = useState(SOURCE_COLORS[0]);
  const [importMapping, setImportMapping] = useState<FieldMapping | null>(null);
  const [importResult, setImportResult] = useState<{ sourceId: string; message: string } | null>(null);
  const queryClient = useQueryClient();

  // ── Step 1: Discover datasets ──
  const {
    data: discovery,
    isLoading: discovering,
    refetch: rediscover,
  } = useQuery({
    queryKey: ['discover', searchQuery],
    queryFn: () => discoverDatasets(searchQuery),
    enabled: false, // manual trigger
  });

  const handleSearch = () => {
    rediscover();
  };

  // ── Step 2: Profile a resource ──
  const profileMutation = useMutation({
    mutationFn: (resourceId: string) => profileResource(resourceId),
    onSuccess: (data) => {
      setActiveProfile(data);
      setImportName(data.suggested_name);
      setImportMapping(data.suggested_mapping);
      setImportColor(SOURCE_COLORS[Math.floor(Math.random() * SOURCE_COLORS.length)]);
      setImportResult(null);
    },
  });

  // ── Step 3: Import ──
  const importMutation = useMutation({
    mutationFn: () => {
      if (!activeProfile || !importMapping) throw new Error('Missing profile or mapping');
      return importResource({
        resource_id: activeProfile.resource.id,
        dataset_id: activeProfile.package.id,
        name: importName,
        color: importColor,
        field_mapping: importMapping,
      });
    },
    onSuccess: (data) => {
      setImportResult({ sourceId: data.source_id, message: data.message });
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      queryClient.invalidateQueries({ queryKey: ['discover'] });
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl sm:text-2xl font-bold text-gray-900">ייבוא יומנים מ-ODATA</h1>

      {/* Step 1: Discovery */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h2 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <Search className="w-5 h-5 text-gray-400" />
          שלב 1: חיפוש מאגרי יומנים
        </h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="חיפוש מאגרים..."
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          <button
            onClick={handleSearch}
            disabled={discovering}
            className="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 disabled:opacity-50 flex items-center gap-2"
          >
            {discovering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            חיפוש
          </button>
        </div>

        {/* Discovery results */}
        {discovery && (
          <div className="mt-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
              <div className="text-xs sm:text-sm text-gray-500">
                נמצאו {discovery.totalDatasets} מאגרים עם {discovery.totalResources} משאבים
              </div>
              <label className="flex items-center gap-2 text-xs sm:text-sm text-gray-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hideConverted}
                  onChange={(e) => setHideConverted(e.target.checked)}
                  className="rounded border-gray-300 text-primary-500 focus:ring-primary-500"
                />
                הסתר קבצי "Converted CSV"
              </label>
            </div>
            <div className="space-y-2">
              {discovery.datasets.map((dataset) => (
                <DatasetCard
                  key={dataset.id}
                  dataset={dataset}
                  hideConverted={hideConverted}
                  onProfile={(resourceId) => profileMutation.mutate(resourceId)}
                  isProfileLoading={profileMutation.isPending}
                  profilingResourceId={profileMutation.variables}
                  // inline Step 3 props
                  activeResourceId={activeProfile?.resource.id}
                  importName={importName}
                  importColor={importColor}
                  importMapping={importMapping}
                  importResult={importResult}
                  onImportNameChange={setImportName}
                  onImportColorChange={setImportColor}
                  onImport={() => importMutation.mutate()}
                  isImporting={importMutation.isPending}
                  importError={importMutation.isError ? (importMutation.error as Error) : null}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Step 2: Profile & Mapping (stays at bottom — contains large field mapping editor + sample data) */}
      {activeProfile && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h2 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <Database className="w-5 h-5 text-gray-400" />
            שלב 2: פרופיל ומיפוי שדות
          </h2>

          {/* Profile summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <InfoCard label="מאגר" value={activeProfile.package.title} />
            <InfoCard label="פורמט" value={activeProfile.format} />
            <InfoCard label="שיטה" value={activeProfile.fetch_method === 'datastore' ? 'API' : 'הורדה'} />
            <InfoCard label="רשומות" value={String(activeProfile.total_records)} />
          </div>

          {/* Duplicate warning */}
          {activeProfile.is_duplicate && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 flex items-center gap-2 text-sm text-yellow-700">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              מקור זה כבר מיובא. ייבוא חוזר יחליף את הנתונים הקיימים.
            </div>
          )}

          {/* Mapping confidence */}
          <div className="mb-4">
            <div className="flex items-center gap-2 text-sm mb-2">
              <span className="font-medium text-gray-700">ביטחון מיפוי:</span>
              <span className={`font-bold ${
                activeProfile.mapping_confidence >= 0.8 ? 'text-green-600' :
                activeProfile.mapping_confidence >= 0.5 ? 'text-yellow-600' : 'text-red-600'
              }`}>
                {Math.round(activeProfile.mapping_confidence * 100)}%
              </span>
              <span className="text-gray-400">({activeProfile.mapping_method})</span>
            </div>
          </div>

          {/* Field mapping editor */}
          {importMapping && (
            <FieldMappingEditor
              mapping={importMapping}
              availableFields={activeProfile.fields}
              onChange={setImportMapping}
            />
          )}

          {/* Sample data preview */}
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">דוגמת נתונים:</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border border-gray-200 rounded">
                <thead className="bg-gray-50">
                  <tr>
                    {activeProfile.fields.slice(0, 8).map((field) => (
                      <th key={field} className="px-2 py-1.5 text-right font-medium text-gray-600 border-b">
                        {field}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeProfile.sample_records.slice(0, 3).map((record, i) => (
                    <tr key={i} className="border-b last:border-b-0">
                      {activeProfile.fields.slice(0, 8).map((field) => (
                        <td key={field} className="px-2 py-1.5 text-gray-600 max-w-[150px] truncate">
                          {String(record[field] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────

function DatasetCard({
  dataset,
  hideConverted,
  onProfile,
  isProfileLoading,
  profilingResourceId,
  activeResourceId,
  importName,
  importColor,
  importMapping,
  importResult,
  onImportNameChange,
  onImportColorChange,
  onImport,
  isImporting,
  importError,
}: {
  dataset: DiscoveredDataset;
  hideConverted: boolean;
  onProfile: (resourceId: string) => void;
  isProfileLoading: boolean;
  profilingResourceId?: string;
  activeResourceId?: string;
  importName: string;
  importColor: string;
  importMapping: FieldMapping | null;
  importResult: { sourceId: string; message: string } | null;
  onImportNameChange: (name: string) => void;
  onImportColorChange: (color: string) => void;
  onImport: () => void;
  isImporting: boolean;
  importError: Error | null;
}) {
  const [expanded, setExpanded] = useState(false);

  const visibleResources = hideConverted
    ? dataset.resources.filter((r) => !r.name.toLowerCase().includes('converted csv'))
    : dataset.resources;

  if (visibleResources.length === 0) return null;

  const syncedCount = visibleResources.filter((r) => r.status === 'synced').length;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Dataset header */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-gray-50 cursor-pointer hover:bg-gray-100"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          <Database className="w-4 h-4 text-gray-400 shrink-0" />
          <span className="text-xs sm:text-sm font-medium text-gray-800 truncate">{dataset.title}</span>
          {dataset.organization && (
            <span className="text-xs text-gray-400 shrink-0 hidden sm:inline">({dataset.organization})</span>
          )}
          <span className="text-[10px] sm:text-xs bg-gray-200 text-gray-600 px-1 sm:px-1.5 py-0.5 rounded shrink-0">
            {visibleResources.length} משאבים
          </span>
          {/* Already-imported badge */}
          {syncedCount > 0 && (
            <span className="text-[10px] sm:text-xs bg-green-100 text-green-700 px-1 sm:px-1.5 py-0.5 rounded shrink-0 flex items-center gap-0.5 font-medium">
              <CheckCircle className="w-3 h-3" />
              {syncedCount} מיובא{syncedCount > 1 ? 'ים' : ''}
            </span>
          )}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </div>

      {/* Resource list */}
      {expanded && (
        <div className="divide-y divide-gray-100">
          {visibleResources.map((resource) => {
            const isActive = activeResourceId === resource.id;
            const isSynced = resource.status === 'synced';

            return (
              <div key={resource.id}>
                {/* Resource row */}
                <div className={`flex items-center justify-between px-3 sm:px-4 py-2 gap-2 ${
                  isActive ? 'bg-blue-50' : isSynced ? 'bg-green-50' : ''
                }`}>
                  <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                    <FormatBadge format={resource.format} />
                    <span className={`text-xs sm:text-sm truncate ${
                      isSynced ? 'text-gray-400 line-through' : 'text-gray-700'
                    }`}>
                      {resource.name}
                    </span>
                    <StatusBadge status={resource.status} />
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onProfile(resource.id);
                    }}
                    disabled={isProfileLoading || isSynced}
                    className="px-3 py-1 text-xs font-medium bg-primary-500 text-white rounded hover:bg-primary-600 disabled:opacity-50 flex items-center gap-1 shrink-0"
                  >
                    {isProfileLoading && profilingResourceId === resource.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <FileSpreadsheet className="w-3 h-3" />
                    )}
                    {isSynced ? 'מיובא' : 'פרופיל'}
                  </button>
                </div>

                {/* ── Inline Step 3: Import panel ── */}
                {isActive && importMapping && (
                  <div className="px-3 sm:px-4 py-4 bg-blue-50 border-t border-blue-100">
                    <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-primary-500" />
                      שלב 3: ייבוא
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                      {/* Name */}
                      <div>
                        <label className="text-xs font-medium text-gray-700 block mb-1">שם המקור</label>
                        <input
                          type="text"
                          value={importName}
                          onChange={(e) => onImportNameChange(e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>

                      {/* Color */}
                      <div>
                        <label className="text-xs font-medium text-gray-700 block mb-1">צבע</label>
                        <div className="flex gap-1 flex-wrap mt-1">
                          {SOURCE_COLORS.map((c) => (
                            <button
                              key={c}
                              onClick={() => onImportColorChange(c)}
                              className={`w-5 h-5 rounded-full transition-transform ${
                                importColor === c ? 'ring-2 ring-offset-1 ring-gray-400 scale-110' : 'hover:scale-105'
                              }`}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Import button + error */}
                    <div className="flex items-center gap-3">
                      <button
                        onClick={onImport}
                        disabled={isImporting || !importName.trim()}
                        className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                      >
                        {isImporting ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <CheckCircle className="w-4 h-4" />
                        )}
                        ייבוא
                      </button>

                      {importError && (
                        <span className="text-sm text-red-600 flex items-center gap-1">
                          <XCircle className="w-4 h-4" />
                          {importError.message}
                        </span>
                      )}
                    </div>

                    {/* Import success */}
                    {importResult && (
                      <div className="mt-3 bg-green-100 border border-green-200 rounded-lg p-2.5">
                        <div className="flex items-center gap-2 text-sm text-green-700">
                          <CheckCircle className="w-4 h-4" />
                          <span className="font-medium">{importResult.message}</span>
                        </div>
                        <div className="text-xs text-green-600 mt-0.5">
                          מזהה מקור: {importResult.sourceId}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FormatBadge({ format }: { format: string }) {
  const colors: Record<string, string> = {
    CSV: 'bg-green-100 text-green-700',
    XLS: 'bg-blue-100 text-blue-700',
    XLSX: 'bg-blue-100 text-blue-700',
    ICS: 'bg-purple-100 text-purple-700',
    ICAL: 'bg-purple-100 text-purple-700',
  };
  const cls = colors[format.toUpperCase()] || 'bg-gray-100 text-gray-600';
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${cls}`}>{format.toUpperCase()}</span>;
}

function StatusBadge({ status }: { status: 'synced' | 'excepted' | 'available' }) {
  if (status === 'synced') return <span className="text-[10px] text-green-600 font-medium">✓ מיובא</span>;
  if (status === 'excepted') return <span className="text-[10px] text-red-500 font-medium">✗ חסום</span>;
  return null;
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-2.5">
      <div className="text-[10px] text-gray-400 uppercase font-medium">{label}</div>
      <div className="text-sm font-semibold text-gray-800 truncate">{value}</div>
    </div>
  );
}

// ── Field mapping editor ──

const FIELD_LABELS: Record<string, string> = {
  title: 'כותרת (חובה)',
  start_date: 'תאריך התחלה (חובה)',
  start_time: 'שעת התחלה',
  end_date: 'תאריך סיום',
  end_time: 'שעת סיום',
  location: 'מיקום',
  participants: 'משתתפים',
  organizer: 'מארגן',
  notes: 'הערות',
};

function FieldMappingEditor({
  mapping,
  availableFields,
  onChange,
}: {
  mapping: FieldMapping;
  availableFields: string[];
  onChange: (mapping: FieldMapping) => void;
}) {
  const handleChange = (key: keyof FieldMapping, value: string) => {
    onChange({ ...mapping, [key]: value || undefined });
  };

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-2">מיפוי שדות:</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        {Object.entries(FIELD_LABELS).map(([key, label]) => (
          <div key={key} className="flex items-center gap-2">
            <label className="text-xs text-gray-600 w-28 shrink-0 text-left">{label}</label>
            <select
              value={mapping[key as keyof FieldMapping] || ''}
              onChange={(e) => handleChange(key as keyof FieldMapping, e.target.value)}
              className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              <option value="">—</option>
              {availableFields.map((field) => (
                <option key={field} value={field}>{field}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
