import { useState, memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFilterStore } from '@/stores/filterStore';
import { useSources } from '@/hooks/useSources';
import { getPublicEntities } from '@/api/events';
import { ChevronDown, ChevronRight, Search, X, Loader2 } from 'lucide-react';

const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

export function FilterPanel() {
  const {
    from_date, to_date, source_ids, entity_names,
    setDateRange, setSourceIds, setEntityNames, reset,
  } = useFilterStore();
  const { data: sourcesData } = useSources();
  const sources = sourcesData?.data ?? [];

  // ── Year / Month accordion ──
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());

  // ── Entity search ──
  const [entitySearch, setEntitySearch] = useState('');
  const [showEntities, setShowEntities] = useState(true);

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

  const selectYear = (year: number) => setDateRange(`${year}-01-01`, `${year}-12-31`);

  const selectMonth = (year: number, month: number) => {
    const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).toISOString().split('T')[0];
    setDateRange(firstDay, lastDay);
  };

  const toggleYear = (year: number) => {
    setExpandedYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  };

  const activeYear = (() => {
    if (!from_date || !to_date) return null;
    const y = new Date(from_date + 'T12:00:00').getFullYear();
    if (from_date === `${y}-01-01` && to_date === `${y}-12-31`) return y;
    return null;
  })();

  const activeMonth = (() => {
    if (!from_date || !to_date) return null;
    const d = new Date(from_date + 'T12:00:00');
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const firstDay = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m, 0).toISOString().split('T')[0];
    if (from_date === firstDay && to_date === lastDay) return { year: y, month: m };
    return null;
  })();

  // ── Entities ──
  // Stable queryKey (no source_ids) — avoids re-fetch on every source checkbox toggle.
  // Server caches this response for 5 min; client caches it here too.
  const { data: entitiesData, isLoading: entitiesLoading } = useQuery({
    queryKey: ['public-entities'],
    queryFn: () => getPublicEntities(),
    staleTime: 5 * 60 * 1000,
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

  const hasEntitySections = personEntities.length > 0 || orgEntities.length > 0 || placeEntities.length > 0
    || entities.length > 0; // show search even if filtered results are empty

  const toggleEntity = (name: string) => {
    const next = entity_names.includes(name)
      ? entity_names.filter((n) => n !== name)
      : [...entity_names, name];
    setEntityNames(next);
  };

  // Shared entity row renderer
  const EntityRow = memo(({ name, count }: { name: string; count: number }) => (
    <label className="flex items-start gap-2 text-sm cursor-pointer min-w-0">
      <input
        type="checkbox"
        checked={entity_names.includes(name)}
        onChange={() => toggleEntity(name)}
        className="rounded border-gray-300 text-primary-500 mt-0.5 shrink-0"
      />
      <span className="min-w-0 flex-1" style={{ overflowWrap: 'anywhere' }}>{name}</span>
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

  // Shared section header style
  const SectionHeader = ({ children }: { children: React.ReactNode }) => (
    <h4 className="text-xs text-gray-500 font-medium pb-1 border-b border-gray-100">{children}</h4>
  );

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 divide-y divide-gray-100 overflow-hidden" role="region" aria-label="סינון תוצאות">
      <div className="flex items-center justify-between pb-3">
        <h3 className="text-sm font-semibold text-gray-700">סינון</h3>
        {(from_date || to_date || source_ids.length > 0 || entity_names.length > 0) && (
          <button
            onClick={reset}
            className="text-[10px] text-gray-400 hover:text-red-500 underline"
          >
            נקה הכל
          </button>
        )}
      </div>

      {/* ── שנה / חודש ── */}
      {years.length > 0 && (
        <div className="space-y-2 py-3 min-w-0">
          <SectionHeader>שנה / חודש</SectionHeader>
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
                        const isActiveM = activeMonth?.year === year && activeMonth.month === m;
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
          {(from_date || to_date) && (
            <button
              onClick={() => setDateRange('', '')}
              className="text-[10px] text-gray-400 hover:text-gray-600 underline mt-0.5"
            >
              נקה סינון תאריך
            </button>
          )}
        </div>
      )}

      {/* ── Active entity chips ── */}
      {entity_names.length > 0 && (
        <div className="space-y-1 py-3">
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
            {entity_names.map((name) => (
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

      {/* ── ישויות (collapsible) ── */}
      <div className="py-3">
        <button
          onClick={() => setShowEntities(!showEntities)}
          className="flex items-center gap-1 text-xs text-gray-500 font-medium w-full hover:text-gray-700 transition-colors pb-1 border-b border-gray-100"
        >
          {showEntities ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          ישויות
          {entitiesLoading && <Loader2 className="w-3 h-3 animate-spin text-gray-400 mr-1" />}
        </button>

        <div
          className="transition-all duration-200 ease-in-out overflow-hidden"
          style={{
            maxHeight: showEntities ? '1000px' : '0',
            opacity: showEntities ? 1 : 0,
          }}
        >
          <div className="space-y-2 pt-2">
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

            {entitiesLoading && !entitiesData ? (
              <SkeletonRows />
            ) : (
              <div className="transition-opacity duration-200 ease-in-out" style={{ opacity: entitiesLoading ? 0.5 : 1 }}>
                {personEntities.length > 0 && (
                  <div className="space-y-1 min-w-0 mb-2">
                    <h5 className="text-xs text-gray-400 font-medium">אנשים</h5>
                    <div className="max-h-48 overflow-y-auto overflow-x-hidden space-y-1">
                      {personEntities.map((e) => <EntityRow key={e.entity_name} name={e.entity_name} count={Number(e.event_count)} />)}
                    </div>
                  </div>
                )}

                {orgEntities.length > 0 && (
                  <div className="space-y-1 min-w-0 mb-2">
                    <h5 className="text-xs text-gray-400 font-medium">ארגונים</h5>
                    <div className="max-h-48 overflow-y-auto overflow-x-hidden space-y-1">
                      {orgEntities.map((e) => <EntityRow key={e.entity_name} name={e.entity_name} count={Number(e.event_count)} />)}
                    </div>
                  </div>
                )}

                {placeEntities.length > 0 && (
                  <div className="space-y-1 min-w-0 mb-2">
                    <h5 className="text-xs text-gray-400 font-medium">מקומות</h5>
                    <div className="max-h-48 overflow-y-auto overflow-x-hidden space-y-1">
                      {placeEntities.map((e) => <EntityRow key={e.entity_name} name={e.entity_name} count={Number(e.event_count)} />)}
                    </div>
                  </div>
                )}

                {entitySearch && personEntities.length === 0 && orgEntities.length === 0 && placeEntities.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-2">לא נמצאה ישות מתאימה</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── שכבות ── */}
      {sources.length > 0 && (
        <div className="space-y-2 pt-3 min-w-0">
          <SectionHeader>שכבות</SectionHeader>
          <div className="max-h-40 overflow-y-auto overflow-x-hidden space-y-1">
            {sources.map((source) => (
              <label key={source.id} className="flex items-start gap-2 text-sm cursor-pointer min-w-0">
                <input
                  type="checkbox"
                  checked={source_ids.includes(source.id)}
                  onChange={() => {
                    const next = source_ids.includes(source.id)
                      ? source_ids.filter((id) => id !== source.id)
                      : [...source_ids, source.id];
                    setSourceIds(next);
                  }}
                  className="rounded border-gray-300 mt-0.5 shrink-0"
                  aria-label={source.name}
                />
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 mt-1"
                  style={{ backgroundColor: source.color }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1" style={{ overflowWrap: 'anywhere' }}>{source.name}</span>
                <span className="text-gray-400 text-xs shrink-0">({source.total_events})</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
