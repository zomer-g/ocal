import { useState, useMemo, memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFilterStore } from '@/stores/filterStore';
import { useSources } from '@/hooks/useSources';
import { getPublicEntities } from '@/api/events';
import { FilterSection } from './FilterSection';
import { Calendar, Users, Building2, MapPin, BookOpen, ChevronDown, ChevronRight, ArrowLeftRight } from 'lucide-react';

const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

// ── Memoized row components ───────────────────────────────────────────

const EntityRow = memo(({ name, count, checked, onToggle }: {
  name: string; count: number; checked: boolean; onToggle: () => void;
}) => (
  <label className="flex items-center gap-2 text-sm cursor-pointer min-w-0 py-0.5">
    <input
      type="checkbox"
      checked={checked}
      onChange={onToggle}
      className="rounded border-gray-300 text-primary-500 shrink-0"
    />
    <span className="min-w-0 flex-1 text-xs text-gray-700 truncate">{name}</span>
    <span className="text-gray-400 text-[10px] shrink-0 tabular-nums">({count})</span>
  </label>
));

const SourceRow = memo(({ name, color, count, checked, onToggle }: {
  name: string; color: string; count: number; checked: boolean; onToggle: () => void;
}) => (
  <label className="flex items-center gap-2 text-sm cursor-pointer min-w-0 py-0.5">
    <input
      type="checkbox"
      checked={checked}
      onChange={onToggle}
      className="rounded border-gray-300 text-primary-500 shrink-0"
    />
    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
    <span className="min-w-0 flex-1 text-xs text-gray-700 truncate">{name}</span>
    <span className="text-gray-400 text-[10px] shrink-0 tabular-nums">({count})</span>
  </label>
));

// ── Skeleton ──────────────────────────────────────────────────────────

function SkeletonRows() {
  return (
    <div className="space-y-2 animate-pulse">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-4 h-4 bg-gray-200 rounded shrink-0" />
          <div className="h-3 bg-gray-200 rounded flex-1" style={{ width: `${50 + i * 10}%` }} />
        </div>
      ))}
    </div>
  );
}

// ── Main FilterPanel ──────────────────────────────────────────────────

export function FilterPanel() {
  const {
    from_date, to_date, source_ids, entity_names, cross_ref_status,
    setDateRange, setSourceIds, setEntityNames, setCrossRefStatus,
    clearDateRange, clearEntities, clearSources, reset,
  } = useFilterStore();

  const { data: sourcesData } = useSources();
  const sources = sourcesData?.data ?? [];

  // ── Local search states ──
  const [yearSearch, setYearSearch] = useState('');
  const [peopleSearch, setPeopleSearch] = useState('');
  const [orgsSearch, setOrgsSearch] = useState('');
  const [placesSearch, setPlacesSearch] = useState('');
  const [sourcesSearch, setSourcesSearch] = useState('');

  // ── Year/Month data ──
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());

  const { minYear, maxYear } = useMemo(() => {
    const minDate = sources.reduce((min, s) => {
      if (!s.first_event_date) return min;
      return !min || s.first_event_date < min ? s.first_event_date : min;
    }, '');
    const maxDate = sources.reduce((max, s) => {
      if (!s.last_event_date) return max;
      return !max || s.last_event_date > max ? s.last_event_date : max;
    }, '');
    return {
      minYear: minDate ? new Date(minDate + 'T12:00:00').getFullYear() : new Date().getFullYear(),
      maxYear: maxDate ? new Date(maxDate + 'T12:00:00').getFullYear() : new Date().getFullYear(),
    };
  }, [sources]);

  const years = useMemo(() => {
    const all = Array.from({ length: maxYear - minYear + 1 }, (_, i) => maxYear - i);
    if (!yearSearch.trim()) return all;
    return all.filter((y) => String(y).includes(yearSearch.trim()));
  }, [minYear, maxYear, yearSearch]);

  const activeYear = useMemo(() => {
    if (!from_date || !to_date) return null;
    const y = new Date(from_date + 'T12:00:00').getFullYear();
    return from_date === `${y}-01-01` && to_date === `${y}-12-31` ? y : null;
  }, [from_date, to_date]);

  const activeMonth = useMemo(() => {
    if (!from_date || !to_date) return null;
    const d = new Date(from_date + 'T12:00:00');
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const firstDay = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m, 0).toISOString().split('T')[0];
    return from_date === firstDay && to_date === lastDay ? { year: y, month: m } : null;
  }, [from_date, to_date]);

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

  // ── Cross-filtered entities query ──
  const { data: entitiesData, isLoading: entitiesLoading, isFetching } = useQuery({
    queryKey: ['public-entities', source_ids, from_date, to_date],
    queryFn: () => getPublicEntities(
      source_ids.length ? source_ids : undefined,
      from_date || undefined,
      to_date || undefined,
    ),
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    placeholderData: (prev) => prev,
  });
  const allEntities = entitiesData?.data ?? [];

  // ── Derived entity lists ──
  const people = useMemo(() => {
    const list = allEntities
      .filter((e) => e.entity_type === 'person')
      .sort((a, b) => Number(b.event_count) - Number(a.event_count));
    if (!peopleSearch.trim()) return list;
    const q = peopleSearch.trim().toLowerCase();
    return list.filter((e) => e.entity_name.toLowerCase().includes(q));
  }, [allEntities, peopleSearch]);

  const orgs = useMemo(() => {
    const list = allEntities
      .filter((e) => e.entity_type === 'organization')
      .sort((a, b) => Number(b.event_count) - Number(a.event_count));
    if (!orgsSearch.trim()) return list;
    const q = orgsSearch.trim().toLowerCase();
    return list.filter((e) => e.entity_name.toLowerCase().includes(q));
  }, [allEntities, orgsSearch]);

  const places = useMemo(() => {
    const list = allEntities
      .filter((e) => e.entity_type === 'place')
      .sort((a, b) => Number(b.event_count) - Number(a.event_count));
    if (!placesSearch.trim()) return list;
    const q = placesSearch.trim().toLowerCase();
    return list.filter((e) => e.entity_name.toLowerCase().includes(q));
  }, [allEntities, placesSearch]);

  // ── Cross-filtered sources ──
  const filteredSources = useMemo(() => {
    let result = sources;
    if (from_date && to_date) {
      result = result.filter(
        (s) => s.first_event_date && s.last_event_date &&
          s.first_event_date <= to_date && s.last_event_date >= from_date,
      );
    }
    if (sourcesSearch.trim()) {
      const q = sourcesSearch.trim().toLowerCase();
      result = result.filter((s) => s.name.toLowerCase().includes(q));
    }
    return result;
  }, [sources, from_date, to_date, sourcesSearch]);

  // ── Entity toggle helpers ──
  const toggleEntity = (name: string) => {
    const next = entity_names.includes(name)
      ? entity_names.filter((n) => n !== name)
      : [...entity_names, name];
    setEntityNames(next);
  };

  const selectedPeopleCount = useMemo(() => {
    const peopleNames = new Set(allEntities.filter((e) => e.entity_type === 'person').map((e) => e.entity_name));
    return entity_names.filter((n) => peopleNames.has(n)).length;
  }, [allEntities, entity_names]);

  const selectedOrgsCount = useMemo(() => {
    const orgNames = new Set(allEntities.filter((e) => e.entity_type === 'organization').map((e) => e.entity_name));
    return entity_names.filter((n) => orgNames.has(n)).length;
  }, [allEntities, entity_names]);

  const selectedPlacesCount = useMemo(() => {
    const placeNames = new Set(allEntities.filter((e) => e.entity_type === 'place').map((e) => e.entity_name));
    return entity_names.filter((n) => placeNames.has(n)).length;
  }, [allEntities, entity_names]);

  // ── Select all / Clear helpers ──
  const selectAllFromList = (list: typeof allEntities) => {
    const names = list.map((e) => e.entity_name);
    setEntityNames([...new Set([...entity_names, ...names])]);
  };
  const clearEntityType = (type: string) => {
    const typeNames = new Set(allEntities.filter((e) => e.entity_type === type).map((e) => e.entity_name));
    setEntityNames(entity_names.filter((n) => !typeNames.has(n)));
  };

  const hasAnyFilter = from_date || to_date || source_ids.length > 0 || entity_names.length > 0 || cross_ref_status;

  return (
    <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100 overflow-hidden" role="region" aria-label="סינון תוצאות">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3">
        <h3 className="text-sm font-bold text-gray-700">סינון</h3>
        {hasAnyFilter && (
          <button onClick={reset} className="text-[10px] text-gray-400 hover:text-red-500 transition-colors underline">
            נקה הכל
          </button>
        )}
      </div>

      {/* ── שנה / חודש ── */}
      <div className="px-4">
        <FilterSection
          title="שנה / חודש"
          icon={<Calendar className="w-3.5 h-3.5" />}
          defaultExpanded
          searchPlaceholder="חיפוש שנה..."
          searchValue={yearSearch}
          onSearchChange={setYearSearch}
          selectedCount={from_date ? 1 : 0}
          onClearAll={from_date ? clearDateRange : undefined}
        >
          {years.length > 0 ? (
            <div className="space-y-0.5">
              {years.map((year) => {
                const isExpanded = expandedYears.has(year);
                const isActiveYear = activeYear === year;
                return (
                  <div key={year}>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => toggleYear(year)}
                        className="p-0.5 text-gray-400 hover:text-gray-600 shrink-0"
                      >
                        {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      </button>
                      <button
                        onClick={() => selectYear(year)}
                        className={`text-xs px-2 py-0.5 rounded transition-colors flex-1 text-right ${
                          isActiveYear ? 'bg-primary-100 text-primary-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'
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
                              className={`text-[11px] px-1 py-1 rounded transition-colors text-center ${
                                isActiveM ? 'bg-primary-100 text-primary-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
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
          ) : (
            <p className="text-xs text-gray-400 text-center py-2">לא נמצאו שנים</p>
          )}
        </FilterSection>
      </div>

      {/* ── אנשים ── */}
      <div className="px-4">
        <FilterSection
          title="אנשים"
          icon={<Users className="w-3.5 h-3.5" />}
          defaultExpanded
          searchPlaceholder="חיפוש אנשים..."
          searchValue={peopleSearch}
          onSearchChange={setPeopleSearch}
          selectedCount={selectedPeopleCount}
          onSelectAll={() => selectAllFromList(people)}
          onClearAll={selectedPeopleCount > 0 ? () => clearEntityType('person') : undefined}
          isLoading={isFetching}
        >
          {entitiesLoading && !entitiesData ? (
            <SkeletonRows />
          ) : people.length > 0 ? (
            people.map((e) => (
              <EntityRow
                key={e.entity_name}
                name={e.entity_name}
                count={Number(e.event_count)}
                checked={entity_names.includes(e.entity_name)}
                onToggle={() => toggleEntity(e.entity_name)}
              />
            ))
          ) : (
            <p className="text-xs text-gray-400 text-center py-2">
              {peopleSearch ? 'לא נמצאו אנשים' : 'אין נתונים'}
            </p>
          )}
        </FilterSection>
      </div>

      {/* ── ארגונים ── */}
      <div className="px-4">
        <FilterSection
          title="ארגונים"
          icon={<Building2 className="w-3.5 h-3.5" />}
          searchPlaceholder="חיפוש ארגונים..."
          searchValue={orgsSearch}
          onSearchChange={setOrgsSearch}
          selectedCount={selectedOrgsCount}
          onSelectAll={() => selectAllFromList(orgs)}
          onClearAll={selectedOrgsCount > 0 ? () => clearEntityType('organization') : undefined}
          isLoading={isFetching}
        >
          {entitiesLoading && !entitiesData ? (
            <SkeletonRows />
          ) : orgs.length > 0 ? (
            orgs.map((e) => (
              <EntityRow
                key={e.entity_name}
                name={e.entity_name}
                count={Number(e.event_count)}
                checked={entity_names.includes(e.entity_name)}
                onToggle={() => toggleEntity(e.entity_name)}
              />
            ))
          ) : (
            <p className="text-xs text-gray-400 text-center py-2">
              {orgsSearch ? 'לא נמצאו ארגונים' : 'אין נתונים'}
            </p>
          )}
        </FilterSection>
      </div>

      {/* ── מקומות ── */}
      <div className="px-4">
        <FilterSection
          title="מקומות"
          icon={<MapPin className="w-3.5 h-3.5" />}
          searchPlaceholder="חיפוש מקומות..."
          searchValue={placesSearch}
          onSearchChange={setPlacesSearch}
          selectedCount={selectedPlacesCount}
          onSelectAll={() => selectAllFromList(places)}
          onClearAll={selectedPlacesCount > 0 ? () => clearEntityType('place') : undefined}
          isLoading={isFetching}
        >
          {entitiesLoading && !entitiesData ? (
            <SkeletonRows />
          ) : places.length > 0 ? (
            places.map((e) => (
              <EntityRow
                key={e.entity_name}
                name={e.entity_name}
                count={Number(e.event_count)}
                checked={entity_names.includes(e.entity_name)}
                onToggle={() => toggleEntity(e.entity_name)}
              />
            ))
          ) : (
            <p className="text-xs text-gray-400 text-center py-2">
              {placesSearch ? 'לא נמצאו מקומות' : 'אין נתונים'}
            </p>
          )}
        </FilterSection>
      </div>

      {/* ── יומנים ── */}
      {sources.length > 0 && (
        <div className="px-4">
          <FilterSection
            title="יומנים"
            icon={<BookOpen className="w-3.5 h-3.5" />}
            defaultExpanded
            searchPlaceholder="חיפוש יומנים..."
            searchValue={sourcesSearch}
            onSearchChange={setSourcesSearch}
            selectedCount={source_ids.length}
            onSelectAll={() => setSourceIds(filteredSources.map((s) => s.id))}
            onClearAll={source_ids.length > 0 ? clearSources : undefined}
          >
            {filteredSources.length > 0 ? (
              filteredSources.map((source) => (
                <SourceRow
                  key={source.id}
                  name={source.name}
                  color={source.color}
                  count={source.total_events}
                  checked={source_ids.includes(source.id)}
                  onToggle={() => {
                    const next = source_ids.includes(source.id)
                      ? source_ids.filter((id) => id !== source.id)
                      : [...source_ids, source.id];
                    setSourceIds(next);
                  }}
                />
              ))
            ) : (
              <p className="text-xs text-gray-400 text-center py-2">
                {sourcesSearch ? 'לא נמצאו יומנים' : 'אין נתונים'}
              </p>
            )}
          </FilterSection>
        </div>
      )}

      {/* ── הצלבה ── */}
      <div className="px-4">
        <FilterSection
          title="סטטוס הצלבה"
          icon={<ArrowLeftRight className="w-3.5 h-3.5" />}
          selectedCount={cross_ref_status ? 1 : 0}
          onClearAll={cross_ref_status ? () => setCrossRefStatus('') : undefined}
        >
          <div className="flex gap-1">
            {([
              { value: '', label: 'הכל' },
              { value: 'confirmed', label: 'אומת' },
              { value: 'unconfirmed', label: 'לא אומת' },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setCrossRefStatus(opt.value)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  cross_ref_status === opt.value
                    ? 'bg-primary-100 border-primary-300 text-primary-800 font-medium'
                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-primary-50 hover:border-primary-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </FilterSection>
      </div>
    </div>
  );
}
