import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  discoverDatasets,
  profileResource,
  importResource,
  getPeople,
  getOrganizations,
  type DiscoveredDataset,
  type ProfileResponse,
  type FieldMapping,
  type Person,
  type Organization,
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
  ExternalLink,
  Clipboard,
  ClipboardCheck,
} from 'lucide-react';

// ────────────────────────────────────────────
// Name similarity helper — word-overlap score
// ────────────────────────────────────────────

/**
 * Returns 0–1 score: fraction of the person's name words that appear in the text.
 * E.g. "מיכאל מלכיאלי" vs "יומן השר לענייני דת, מיכאל מלכיאלי, לשנת 2025" → 1.0
 */
function calcNameSimilarity(text: string, personName: string): number {
  const normalizedText = text.toLowerCase().replace(/[,()[\]]/g, ' ');
  const nameWords = personName.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (!nameWords.length) return 0;
  const matched = nameWords.filter((w) => normalizedText.includes(w));
  return matched.length / nameWords.length;
}

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
  const [importPersonId, setImportPersonId] = useState<string | null>(null);
  const [importOrgId, setImportOrgId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Fetch people & orgs for the selector
  const { data: peopleData } = useQuery({ queryKey: ['admin-people'], queryFn: getPeople });
  const { data: orgsData } = useQuery({ queryKey: ['admin-orgs'], queryFn: getOrganizations });
  const people = peopleData?.data ?? [];
  const orgs = orgsData?.data ?? [];

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
    mutationFn: (params: { resourceId: string; sheetName?: string }) =>
      profileResource(params.resourceId, params.sheetName),
    onSuccess: (data) => {
      setActiveProfile(data);
      setImportName(data.suggested_name);
      setImportMapping(data.suggested_mapping);
      setImportColor(SOURCE_COLORS[Math.floor(Math.random() * SOURCE_COLORS.length)]);
      setImportResult(null);
      setImportPersonId(null);   // clear previous selection so auto-fill effect can re-trigger
      setImportOrgId(null);
    },
  });

  // Track which sheets have been imported (for multi-sheet workbooks)
  const [importedSheets, setImportedSheets] = useState<Set<string>>(new Set());

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
        person_id: importPersonId,
        organization_id: importOrgId,
        sheet_name: activeProfile.sheet_name,
      });
    },
    onSuccess: (data) => {
      setImportResult({ sourceId: data.source_id, message: data.message });
      // Track imported sheet
      if (activeProfile?.sheet_name) {
        setImportedSheets(prev => new Set(prev).add(activeProfile.sheet_name!));
      }
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
        {discovery && (() => {
          // Shared props passed to every DatasetCard
          const cardProps = {
            hideConverted,
            onProfile: (resourceId: string) => profileMutation.mutate({ resourceId }),
            onSheetChange: (sheetName: string) => {
              if (!activeProfile) return;
              profileMutation.mutate({ resourceId: activeProfile.resource.id, sheetName });
            },
            isProfileLoading: profileMutation.isPending,
            profilingResourceId: profileMutation.variables?.resourceId,
            profileError: profileMutation.isError ? (profileMutation.error as Error) : null,
            profileErrorResourceId: profileMutation.isError ? profileMutation.variables?.resourceId : undefined,
            activeProfile,
            importName,
            importColor,
            importMapping,
            importResult,
            importPersonId,
            importOrgId,
            importedSheets,
            people,
            orgs,
            onImportNameChange: setImportName,
            onImportColorChange: setImportColor,
            onImportMappingChange: setImportMapping,
            onImportPersonChange: (personId: string | null) => setImportPersonId(personId),
            onImportOrgChange: setImportOrgId,
            onImport: () => importMutation.mutate(),
            isImporting: importMutation.isPending,
            importError: importMutation.isError ? (importMutation.error as Error) : null,
          };

          // Group datasets by import status
          const newDs      = discovery.datasets.filter(d => d.resources.every(r => r.status !== 'synced'));
          const partialDs  = discovery.datasets.filter(d => d.resources.some(r => r.status === 'synced') && d.resources.some(r => r.status === 'available'));
          const doneDs     = discovery.datasets.filter(d => d.resources.length > 0 && d.resources.every(r => r.status !== 'available'));

          const SectionDivider = ({ label }: { label: string }) => (
            <div className="flex items-center gap-3 my-3">
              <div className="flex-1 border-t border-gray-300" />
              <span className="text-xs text-gray-400 font-medium whitespace-nowrap">{label}</span>
              <div className="flex-1 border-t border-gray-300" />
            </div>
          );

          return (
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
                {/* Group 1: not imported at all */}
                {newDs.map(d => <DatasetCard key={d.id} dataset={d} {...cardProps} />)}

                {/* Group 2: partially imported */}
                {partialDs.length > 0 && (
                  <>
                    <SectionDivider label={`יובא חלקית (${partialDs.length})`} />
                    {partialDs.map(d => <DatasetCard key={d.id} dataset={d} {...cardProps} />)}
                  </>
                )}

                {/* Group 3: fully imported */}
                {doneDs.length > 0 && (
                  <>
                    <SectionDivider label={`יובא לחלוטין (${doneDs.length})`} />
                    {doneDs.map(d => <DatasetCard key={d.id} dataset={d} {...cardProps} />)}
                  </>
                )}
              </div>
            </div>
          );
        })()}
      </div>
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
  onSheetChange,
  isProfileLoading,
  profilingResourceId,
  profileError,
  profileErrorResourceId,
  activeProfile,
  importName,
  importColor,
  importMapping,
  importResult,
  importPersonId,
  importOrgId,
  importedSheets,
  people,
  orgs,
  onImportNameChange,
  onImportColorChange,
  onImportMappingChange,
  onImportPersonChange,
  onImportOrgChange,
  onImport,
  isImporting,
  importError,
}: {
  dataset: DiscoveredDataset;
  hideConverted: boolean;
  onProfile: (resourceId: string) => void;
  onSheetChange: (sheetName: string) => void;
  isProfileLoading: boolean;
  profilingResourceId?: string;
  profileError: Error | null;
  profileErrorResourceId?: string;
  activeProfile: ProfileResponse | null;
  importName: string;
  importColor: string;
  importMapping: FieldMapping | null;
  importResult: { sourceId: string; message: string } | null;
  importPersonId: string | null;
  importOrgId: string | null;
  importedSheets: Set<string>;
  people: Person[];
  orgs: Organization[];
  onImportNameChange: (name: string) => void;
  onImportColorChange: (color: string) => void;
  onImportMappingChange: (mapping: FieldMapping) => void;
  onImportPersonChange: (personId: string | null) => void;
  onImportOrgChange: (orgId: string | null) => void;
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
          <a
            href={dataset.odata_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-gray-400 hover:text-primary-500 shrink-0"
            title="פתח ב-ODATA"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
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
            const isActive = activeProfile?.resource.id === resource.id;
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

                {/* ── Profile error (shown inline for the resource that failed) ── */}
                {profileError && profileErrorResourceId === resource.id && (
                  <div className="bg-red-50 border-t border-red-200 px-3 sm:px-4 py-3 flex items-center gap-2 text-xs text-red-700">
                    <XCircle className="w-4 h-4 shrink-0" />
                    <span className="flex-1">שגיאה בטעינת פרופיל: {profileError.message}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); onProfile(resource.id); }}
                      className="px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded hover:bg-red-200 shrink-0"
                    >
                      נסה שוב
                    </button>
                  </div>
                )}

                {/* ── Inline Profile + Import panel (everything together) ── */}
                {isActive && activeProfile && importMapping && (
                  <InlineImportPanel
                    activeProfile={activeProfile}
                    importName={importName}
                    importColor={importColor}
                    importMapping={importMapping}
                    importResult={importResult}
                    importPersonId={importPersonId}
                    importOrgId={importOrgId}
                    importedSheets={importedSheets}
                    people={people}
                    orgs={orgs}
                    onImportNameChange={onImportNameChange}
                    onImportColorChange={onImportColorChange}
                    onImportMappingChange={onImportMappingChange}
                    onImportPersonChange={onImportPersonChange}
                    onImportOrgChange={onImportOrgChange}
                    onSheetChange={onSheetChange}
                    onImport={onImport}
                    isImporting={isImporting}
                    importError={importError}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────
// Inline panel: profile + mapping + import — all in one
// ────────────────────────────────────────────

function InlineImportPanel({
  activeProfile,
  importName,
  importColor,
  importMapping,
  importResult,
  importPersonId,
  importOrgId,
  importedSheets,
  people,
  orgs,
  onImportNameChange,
  onImportColorChange,
  onImportMappingChange,
  onImportPersonChange,
  onImportOrgChange,
  onSheetChange,
  onImport,
  isImporting,
  importError,
}: {
  activeProfile: ProfileResponse;
  importName: string;
  importColor: string;
  importMapping: FieldMapping;
  importResult: { sourceId: string; message: string } | null;
  importPersonId: string | null;
  importOrgId: string | null;
  importedSheets: Set<string>;
  people: Person[];
  orgs: Organization[];
  onImportNameChange: (name: string) => void;
  onImportColorChange: (color: string) => void;
  onImportMappingChange: (mapping: FieldMapping) => void;
  onImportPersonChange: (personId: string | null) => void;
  onImportOrgChange: (orgId: string | null) => void;
  onSheetChange: (sheetName: string) => void;
  onImport: () => void;
  isImporting: boolean;
  importError: Error | null;
}) {
  const [showSample, setShowSample] = useState(true);
  const [copied, setCopied] = useState(false);
  const unmappedSet = new Set(activeProfile.unmapped_fields);

  // ── Copy-to-clipboard brief for debugging ──
  const copyBrief = (errorText: string) => {
    const fieldLabels: Record<string, string> = {
      title: 'כותרת', start_date: 'תאריך התחלה', start_time: 'שעת התחלה',
      end_date: 'תאריך סיום', end_time: 'שעת סיום', location: 'מיקום',
      participants: 'משתתפים', organizer: 'מארגן', notes: 'הערות',
    };
    const mappingLines = Object.entries(fieldLabels)
      .map(([k, label]) => `  ${label}: ${importMapping[k as keyof FieldMapping] || '—'}`)
      .join('\n');
    const brief = [
      'שגיאת ייבוא',
      '',
      `שגיאה: ${errorText}`,
      '',
      `מאגר: ${activeProfile.package.title}`,
      `משאב: ${activeProfile.resource.name || activeProfile.resource.id}`,
      `קישור: ${activeProfile.odata_resource_url}`,
      `פורמט: ${activeProfile.format} | ${activeProfile.total_records} רשומות`,
      `ביטחון מיפוי: ${Math.round(activeProfile.mapping_confidence * 100)}% (${activeProfile.mapping_method})`,
      '',
      'מיפוי שדות:',
      mappingLines,
      '',
      `שדות זמינים: ${activeProfile.fields.join(', ')}`,
      `שדות לא מזוהים: ${activeProfile.unmapped_fields.join(', ') || 'אין'}`,
    ].join('\n');
    navigator.clipboard.writeText(brief).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const CopyBriefButton = ({ errorText }: { errorText: string }) => (
    <button
      onClick={() => copyBrief(errorText)}
      className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded border transition-colors shrink-0 ${
        copied
          ? 'border-green-300 bg-green-50 text-green-700'
          : 'border-gray-300 bg-white hover:bg-gray-50 text-gray-600'
      }`}
      title="העתק דיווח ללוח"
    >
      {copied
        ? <><ClipboardCheck className="w-3 h-3" />הועתק</>
        : <><Clipboard className="w-3 h-3" />העתק דיווח</>
      }
    </button>
  );

  // ── Person matching: check sheet name → resource name → dataset title (first match wins) ──
  const scoredPeople = useMemo(() => {
    const sheetName = activeProfile.sheet_name || '';
    const resourceName = activeProfile.resource.name || '';
    const datasetTitle = activeProfile.package.title || '';
    return people
      .map((p) => {
        const score = Math.max(
          sheetName ? calcNameSimilarity(sheetName, p.name) : 0,
          resourceName ? calcNameSimilarity(resourceName, p.name) : 0,
          calcNameSimilarity(datasetTitle, p.name),
        );
        return { ...p, score };
      })
      .sort((a, b) => b.score - a.score);
  }, [people, activeProfile.sheet_name, activeProfile.resource.name, activeProfile.package.title]);
  const bestMatch = scoredPeople.length > 0 && scoredPeople[0].score >= 0.5 ? scoredPeople[0] : null;

  // ── Auto-fill person when a confident match exists ──
  useEffect(() => {
    if (bestMatch && importPersonId === null) {
      onImportPersonChange(bestMatch.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bestMatch?.id]);

  return (
    <div className="bg-blue-50 border-t border-blue-100 px-3 sm:px-4 py-4 space-y-4">
      {/* ── Sheet tabs (for multi-sheet workbooks) ── */}
      {activeProfile.available_sheets && activeProfile.available_sheets.length > 1 && (
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          <span className="text-xs text-gray-500 font-medium shrink-0 ml-1">גיליונות:</span>
          {activeProfile.available_sheets.map((sheet) => {
            const isActive = activeProfile.sheet_name === sheet.name;
            const isImported = importedSheets.has(sheet.name);
            return (
              <button
                key={sheet.name}
                onClick={() => !isActive && onSheetChange(sheet.name)}
                className={`px-2 py-1 text-xs rounded-lg border transition-colors flex items-center gap-1 shrink-0 ${
                  isActive
                    ? 'bg-white border-primary-300 text-primary-700 font-semibold shadow-sm'
                    : isImported
                    ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-white hover:border-gray-300'
                }`}
              >
                {isImported && <CheckCircle className="w-3 h-3 text-green-500" />}
                <span className="truncate max-w-[120px]">{sheet.name}</span>
                <span className="text-[10px] opacity-60">({sheet.rows})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── ODATA links + Profile summary ── */}
      <div className="flex items-center gap-3 text-xs">
        <a
          href={activeProfile.odata_dataset_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-700 font-medium"
        >
          <ExternalLink className="w-3 h-3" />
          מאגר ב-ODATA
        </a>
        <span className="text-gray-300">|</span>
        <a
          href={activeProfile.odata_resource_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-700 font-medium"
        >
          <ExternalLink className="w-3 h-3" />
          משאב ב-ODATA
        </a>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <InfoCard label="מאגר" value={activeProfile.package.title} />
        <InfoCard label="פורמט" value={activeProfile.format} />
        <InfoCard label="שיטה" value={activeProfile.fetch_method === 'datastore' ? 'API' : 'הורדה'} />
        <InfoCard label="רשומות" value={String(activeProfile.total_records)} />
      </div>

      {/* Duplicate warning */}
      {activeProfile.is_duplicate && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2.5 flex items-center gap-2 text-xs text-yellow-700">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          מקור זה כבר מיובא. ייבוא חוזר יחליף את הנתונים הקיימים.
        </div>
      )}

      {/* ── Field mapping ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Database className="w-4 h-4 text-gray-400" />
            מיפוי שדות
          </h3>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-500">ביטחון:</span>
            <span className={`font-bold ${
              activeProfile.mapping_confidence >= 0.8 ? 'text-green-600' :
              activeProfile.mapping_confidence >= 0.5 ? 'text-yellow-600' : 'text-red-600'
            }`}>
              {Math.round(activeProfile.mapping_confidence * 100)}%
            </span>
            <span className="text-gray-400">({activeProfile.mapping_method})</span>
          </div>
        </div>
        <FieldMappingEditor
          mapping={importMapping}
          availableFields={activeProfile.fields}
          onChange={onImportMappingChange}
        />
      </div>

      {/* ── Sample data (collapsible) ── */}
      <div>
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowSample(!showSample)}
            className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
          >
            {showSample ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {showSample ? 'הסתר דוגמת נתונים' : 'הצג דוגמת נתונים'}
          </button>
          {showSample && unmappedSet.size > 0 && (
            <div className="flex items-center gap-3 text-[10px] text-gray-500">
              <span className="flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 rounded bg-gray-100 border border-gray-300" />
                זוהה
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 rounded bg-amber-100 border border-amber-300" />
                לא זוהה ({unmappedSet.size})
              </span>
            </div>
          )}
        </div>
        {showSample && (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs border border-gray-200 rounded bg-white">
              <thead>
                <tr>
                  {activeProfile.fields.map((field) => {
                    const isUnmapped = unmappedSet.has(field);
                    return (
                      <th
                        key={field}
                        className={`px-2 py-1.5 text-right font-medium border-b whitespace-nowrap ${
                          isUnmapped
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-gray-50 text-gray-600 border-gray-200'
                        }`}
                      >
                        {field}
                        {isUnmapped && <span className="mr-1 opacity-60">✗</span>}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {activeProfile.sample_records.slice(0, 3).map((record, i) => (
                  <tr key={i} className="border-b last:border-b-0">
                    {activeProfile.fields.map((field) => {
                      const isUnmapped = unmappedSet.has(field);
                      return (
                        <td
                          key={field}
                          className={`px-2 py-1.5 max-w-[150px] truncate ${
                            isUnmapped ? 'bg-amber-50 text-amber-700' : 'text-gray-600'
                          }`}
                        >
                          {String(record[field] ?? '')}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Import form (name, color, button) ── */}
      {(() => {
        const missingRequired: string[] = [];
        if (!importMapping.title) missingRequired.push('כותרת');
        if (!importMapping.start_date) missingRequired.push('תאריך התחלה');
        const canImport = missingRequired.length === 0 && importName.trim().length > 0;

        return (
          <div className="border-t border-blue-200 pt-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary-500" />
              ייבוא
            </h3>

            {/* Missing required fields warning */}
            {missingRequired.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 mb-3 flex items-center gap-2 text-xs text-red-700">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span className="flex-1">שדות חובה חסרים במיפוי: <strong>{missingRequired.join(', ')}</strong>. יש לבחור עמודה מתאימה מהרשימה.</span>
                <CopyBriefButton errorText={`שדות חובה חסרים במיפוי: ${missingRequired.join(', ')}`} />
              </div>
            )}

            {/* Low record count warning */}
            {activeProfile.total_records < 10 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 mb-3 flex items-center gap-2 text-xs text-amber-700">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span className="flex-1">מאגר זה מכיל רק <strong>{activeProfile.total_records}</strong> רשומות — ייתכן שהמיפוי שגוי או שהנתונים חסרים.</span>
                <CopyBriefButton errorText={`מאגר עם ${activeProfile.total_records} רשומות בלבד`} />
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              {/* Person (diary owner) */}
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">בעל היומן (אישיות)</label>

                {/* Auto-detected person indicator */}
                {bestMatch && importPersonId === bestMatch.id && (
                  <div className="flex items-center gap-2 mb-1.5 px-2 py-1.5 rounded-lg text-xs border bg-green-50 border-green-200 text-green-800">
                    <span className="font-semibold shrink-0">✓ זוהה אוטומטית</span>
                    <span className="text-[10px] opacity-60 shrink-0">{Math.round(bestMatch.score * 100)}%</span>
                  </div>
                )}

                <select
                  value={importPersonId ?? ''}
                  onChange={(e) => onImportPersonChange(e.target.value || null)}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">— ללא —</option>
                  {scoredPeople.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.score >= 0.5 ? '★ ' : ''}{p.name}{p.organization_name ? ` (${p.organization_name})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Organization */}
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">ארגון</label>
                <select
                  value={importOrgId ?? ''}
                  onChange={(e) => onImportOrgChange(e.target.value || null)}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">— ללא —</option>
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>

              {/* Name */}
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">שם המקור</label>
                <input
                  type="text"
                  value={importName}
                  onChange={(e) => onImportNameChange(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
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

            {/* Import button */}
            <div className="flex items-center gap-3">
              <button
                onClick={onImport}
                disabled={isImporting || !canImport}
                className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
              >
                {isImporting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4" />
                )}
                ייבוא ({activeProfile.total_records} רשומות)
              </button>

              {importError && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-red-600 flex items-center gap-1">
                    <XCircle className="w-4 h-4" />
                    {importError.message}
                  </span>
                  <CopyBriefButton errorText={importError.message} />
                </div>
              )}
            </div>
          </div>
        );
      })()}

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
  );
}

// ────────────────────────────────────────────
// Small helpers
// ────────────────────────────────────────────

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
    <div className="bg-white rounded-lg p-2.5 border border-gray-100">
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

const REQUIRED_FIELDS = new Set(['title', 'start_date']);

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
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
      {Object.entries(FIELD_LABELS).map(([key, label]) => {
        const isRequired = REQUIRED_FIELDS.has(key);
        const isMissing = isRequired && !mapping[key as keyof FieldMapping];

        return (
          <div key={key} className="flex items-center gap-2">
            <label className={`text-xs w-28 shrink-0 text-left ${
              isMissing ? 'text-red-600 font-semibold' : 'text-gray-600'
            }`}>
              {label}
            </label>
            <select
              value={mapping[key as keyof FieldMapping] || ''}
              onChange={(e) => handleChange(key as keyof FieldMapping, e.target.value)}
              className={`flex-1 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 ${
                isMissing
                  ? 'border-2 border-red-400 bg-red-50'
                  : 'border border-gray-300'
              }`}
            >
              <option value="">—</option>
              {availableFields.map((field) => (
                <option key={field} value={field}>{field}</option>
              ))}
            </select>
          </div>
        );
      })}
    </div>
  );
}
