import { useState, memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCalendarStore } from '@/stores/calendarStore';
import { getPublicEntities } from '@/api/events';
import { Eye, EyeOff, ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import type { DiarySource } from '@/api/sources';

const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

interface LayerPanelProps {
  sources: DiarySource[];
  viewSourceCounts?: Record<string, number>;
}

export function LayerPanel({ sources, viewSourceCounts }: LayerPanelProps) {
  const { enabledSourceIds, selectedEntityNames, toggleSource, setAllSources, setEntityNames, date, setDate, setView } = useCalendarStore();
  const allEnabled = sources.length > 0 && sources.every((s) => enabledSourceIds.has(s.id));

  // ── Year / Month accordion ──
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());

  // ── Entity search ──
  const [entitySearch, setEntitySearch] = useState('');

  const minDate = sources.reduce((min, s) => {
    if (!s.first_event_date) return min;
    return !min || s.first_event_date < min ? s.first_event_date : min;
  }, '');
  const maxDate = sources.reduce((max, s) => {
    if (!s.last_event_date) return max;
    return !max || s.last_event_date > max ? s.last_event_date : max;
  }, '');

  const minYear = minDate ? new Date(minDate + 'T12:00:00').getFullYear() : new Date().getFullYear();
  const maxYear = maxDate ? new Date(maxDate + 'T12:00:00').getFullYear() : new Date().getFullYear();
  const years = Array.from({ length: maxYear - minYear + 1 }, (_, i) => maxYear - i);

  const activeYear = new Date(date + 'T12:00:00').getFullYear();
  const activeMonth = new Date(date + 'T12:00:00').getMonth() + 1;

  const selectYear = (year: number) => {
    setDate(`${year}-01-01`);
    setView('month');
  };

  const selectMonth = (year: number, month: number) => {
    setDate(`${year}-${String(month).padStart(2, '0')}-01`);
    setView('month');
  };

  const toggleYear = (year: number) => {
    setExpandedYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  };

  // ── Entities ──
  const sourceIdsArray = Array.from(enabledSourceIds);
  const { data: entitiesData, isLoading: entitiesLoading } = useQuery({
    queryKey: ['public-entities', sourceIdsArray],
    queryFn: () => getPublicEntities(sourceIdsArray.length ? sourceIdsArray : undefined),
    staleTime: 60 * 1000,
  });
  const entities = entitiesData?.data ?? [];

  const byCount = (list: typeof entities) =>
    [...list].sort((a, b) => Number(b.event_count) - Number(a.event_count));

  const filterBySearch = (list: typeof entities) =>
    entitySearch.trim()
      ? list.filter((e) => e.entity_name.toLowerCase().includes(entitySearch.toLowerCase()))
      : list;

  const personEntities = filterBySearch(byCount(entities.filter((e) => e.entity_type === 'person')));
  const orgEntities    = filterBySearch(byCount(entities.filter((e) => e.entity_type === 'organization')));
  const placeEntities  = filterBySearch(byCount(entities.filter((e) => e.entity_type === 'place')));

  const hasEntitySections = entities.length > 0;

  const toggleEntity = (name: string) => {
    const next = selectedEntityNames.includes(name)
      ? selectedEntityNames.filter((n) => n !== name)
      : [...selectedEntityNames, name];
    setEntityNames(next);
  };

  const handleToggleAll = () => {
    if (allEnabled) setAllSources([], false);
    else setAllSources(sources.map((s) => s.id), true);
  };

  // Shared entity row renderer
  const EntityRow = memo(({ name, count }: { name: string; count: number }) => (
    <label className="flex items-start gap-2 text-sm cursor-pointer min-w-0">
      <input
        type="checkbox"
        checked={selectedEntityNames.includes(name)}
        onChange={() => toggleEntity(name)}
        className="rounded border-gray-300 text-primary-500 mt-0.5 shrink-0"
      />
      <span className="break-words min-w-0 flex-1">{name}</span>
      <span className="text-gray-400 text-xs shrink-0">({count})</span>
    </label>
  ));

  // Skeleton rows while loading
  const SkeletonRows = () => (
    <div className="space-y-2 animate-pulse">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-4 h-4 bg-gray-200 rounded shrink-0" />
          <div className="h-3 bg-gray-200 rounded flex-1" style={{ width: `${50 + i * 10}%` }} />
        </div>
      ))}
    </div>
  );

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4" role="region" aria-label="סינון תצוגה">
      <h3 className="text-sm font-semibold text-gray-700">סינון</h3>

      {/* ── שנה / חודש ── */}
      {years.length > 0 && (
        <fieldset className="space-y-1">
          <legend className="text-xs text-gray-500 font-medium mb-1">שנה / חודש</legend>
          <div className="max-h-56 overflow-y-auto space-y-0.5">
            {years.map((year) => {
              const isExpanded = expandedYears.has(year);
              const isActiveYear = activeYear === year;
              return (
                <div key={year}>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => toggleYear(year)}
                      className="p-0.5 text-gray-400 hover:text-gray-600 shrink-0"
                      aria-label={isExpanded ? `כווץ ${year}` : `הרחב ${year}`}
                    >
                      {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    </button>
                    <button
                      onClick={() => selectYear(year)}
                      className={`text-xs px-2 py-0.5 rounded transition-colors flex-1 text-right ${
                        isActiveYear ? 'bg-primary-100 text-primary-700 font-semibold' : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      {year}
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="mr-5 grid grid-cols-3 gap-0.5 mt-0.5">
                      {HEBREW_MONTHS.map((monthName, idx) => {
                        const m = idx + 1;
                        const isActiveM = isActiveYear && activeMonth === m;
                        return (
                          <button
                            key={m}
                            onClick={() => selectMonth(year, m)}
                            className={`text-xs px-1.5 py-1 rounded transition-colors text-center ${
                              isActiveM ? 'bg-primary-100 text-primary-700 font-medium' : 'text-gray-600 hover:bg-gray-100'
                            }`}
                          >
                            {monthName}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </fieldset>
      )}

      {/* ── Active entity chips ── */}
      {selectedEntityNames.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 font-medium">ישויות פעילות</span>
            <button
              onClick={() => setEntityNames([])}
              className="text-[10px] text-gray-400 hover:text-gray-600 underline"
            >
              נקה הכל
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {selectedEntityNames.map((name) => (
              <span
                key={name}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary-100 text-primary-800 text-xs font-medium"
              >
                {name}
                <button
                  onClick={() => toggleEntity(name)}
                  aria-label={`הסר ${name}`}
                  className="hover:text-primary-600"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Entity search input ── */}
      {hasEntitySections && (
        <div className="relative">
          <Search className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" aria-hidden="true" />
          <input
            type="text"
            value={entitySearch}
            onChange={(e) => setEntitySearch(e.target.value)}
            placeholder="חיפוש ישות..."
            className="w-full text-xs pr-7 pl-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-primary-400 bg-gray-50"
            aria-label="חיפוש ישות לסינון"
          />
          {entitySearch && (
            <button
              onClick={() => setEntitySearch('')}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label="נקה חיפוש"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* ── Entity sections (with loading skeleton) ── */}
      {entitiesLoading && !entitiesData ? (
        <>
          <fieldset className="space-y-1">
            <legend className="text-xs text-gray-500 font-medium">אנשים</legend>
            <SkeletonRows />
          </fieldset>
          <fieldset className="space-y-1">
            <legend className="text-xs text-gray-500 font-medium">מקומות</legend>
            <SkeletonRows />
          </fieldset>
        </>
      ) : (
        <>
          {/* ── אנשים ── */}
          {personEntities.length > 0 && (
            <fieldset className="space-y-1">
              <legend className="text-xs text-gray-500 font-medium">אנשים</legend>
              <div className="max-h-48 overflow-y-auto overflow-x-hidden space-y-1">
                {personEntities.map((e) => <EntityRow key={e.entity_name} name={e.entity_name} count={Number(e.event_count)} />)}
              </div>
            </fieldset>
          )}

          {/* ── ארגונים ── */}
          {orgEntities.length > 0 && (
            <fieldset className="space-y-1">
              <legend className="text-xs text-gray-500 font-medium">ארגונים</legend>
              <div className="max-h-48 overflow-y-auto overflow-x-hidden space-y-1">
                {orgEntities.map((e) => <EntityRow key={e.entity_name} name={e.entity_name} count={Number(e.event_count)} />)}
              </div>
            </fieldset>
          )}

          {/* ── מקומות ── */}
          {placeEntities.length > 0 && (
            <fieldset className="space-y-1">
              <legend className="text-xs text-gray-500 font-medium">מקומות</legend>
              <div className="max-h-48 overflow-y-auto overflow-x-hidden space-y-1">
                {placeEntities.map((e) => <EntityRow key={e.entity_name} name={e.entity_name} count={Number(e.event_count)} />)}
              </div>
            </fieldset>
          )}

          {/* No entity results message */}
          {entitySearch && personEntities.length === 0 && orgEntities.length === 0 && placeEntities.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-2">לא נמצאה ישות מתאימה</p>
          )}
        </>
      )}

      {/* ── שכבות ── */}
      {sources.length > 0 && (
        <fieldset className="space-y-2">
          <div className="flex items-center justify-between">
            <legend className="text-xs text-gray-500 font-medium">שכבות</legend>
            <button
              onClick={handleToggleAll}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              aria-label={allEnabled ? 'הסתר הכל' : 'הצג הכל'}
            >
              {allEnabled ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
          <div className="max-h-40 overflow-y-auto overflow-x-hidden space-y-1">
            {sources.map((source) => {
              const isEnabled = enabledSourceIds.has(source.id);
              const viewCount = viewSourceCounts?.[source.id] ?? 0;
              const hasEventsInView = !viewSourceCounts || viewCount > 0;
              return (
                <label
                  key={source.id}
                  className={`flex items-start gap-2 text-sm cursor-pointer transition-opacity min-w-0 ${
                    isEnabled ? (hasEventsInView ? '' : 'opacity-40') : 'opacity-30'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    onChange={() => toggleSource(source.id)}
                    className="sr-only"
                    aria-label={`${source.name} — ${isEnabled ? 'מוצג' : 'מוסתר'}`}
                  />
                  <div
                    className="w-3.5 h-3.5 mt-0.5 rounded-sm border-2 shrink-0 flex items-center justify-center"
                    style={{ borderColor: source.color, backgroundColor: isEnabled ? source.color : undefined }}
                    aria-hidden="true"
                  >
                    {isEnabled && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className="break-words min-w-0 flex-1">{source.name}</span>
                  <span className="text-gray-400 text-xs shrink-0">
                    ({viewSourceCounts && viewCount > 0 ? viewCount : source.total_events})
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}
    </div>
  );
}
