import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFilterStore } from '@/stores/filterStore';
import { useSources } from '@/hooks/useSources';
import { getPublicEntities } from '@/api/events';
import { ChevronDown, ChevronRight } from 'lucide-react';

const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

export function FilterPanel() {
  const {
    from_date, to_date, source_ids, entity_names,
    setDateRange, setSourceIds, setEntityNames,
  } = useFilterStore();
  const { data: sourcesData } = useSources();
  const sources = sourcesData?.data ?? [];

  // ── Year / Month accordion ──
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());

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
  const { data: entitiesData } = useQuery({
    queryKey: ['public-entities', source_ids],
    queryFn: () => getPublicEntities(source_ids.length ? source_ids : undefined),
    staleTime: 60 * 1000,
  });
  const entities = entitiesData?.data ?? [];

  const byCount = (list: typeof entities) =>
    [...list].sort((a, b) => Number(b.event_count) - Number(a.event_count));

  const personEntities = byCount(entities.filter((e) => e.entity_type === 'person'));
  const orgEntities    = byCount(entities.filter((e) => e.entity_type === 'organization'));
  const placeEntities  = byCount(entities.filter((e) => e.entity_type === 'place'));

  const toggleEntity = (name: string) => {
    const next = entity_names.includes(name)
      ? entity_names.filter((n) => n !== name)
      : [...entity_names, name];
    setEntityNames(next);
  };

  // Shared entity row renderer
  const EntityRow = ({ name, count }: { name: string; count: number }) => (
    <label className="flex items-start gap-2 text-sm cursor-pointer">
      <input
        type="checkbox"
        checked={entity_names.includes(name)}
        onChange={() => toggleEntity(name)}
        className="rounded border-gray-300 text-primary-500 mt-0.5 shrink-0"
      />
      <span className="break-words min-w-0">{name}</span>
      <span className="text-gray-400 mr-auto text-xs shrink-0">({count})</span>
    </label>
  );

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4" role="region" aria-label="סינון תוצאות">
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
        </fieldset>
      )}

      {/* ── אנשים ── */}
      {personEntities.length > 0 && (
        <fieldset className="space-y-1">
          <legend className="text-xs text-gray-500 font-medium">אנשים</legend>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {personEntities.map((e) => <EntityRow key={e.entity_name} name={e.entity_name} count={Number(e.event_count)} />)}
          </div>
        </fieldset>
      )}

      {/* ── ארגונים ── */}
      {orgEntities.length > 0 && (
        <fieldset className="space-y-1">
          <legend className="text-xs text-gray-500 font-medium">ארגונים</legend>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {orgEntities.map((e) => <EntityRow key={e.entity_name} name={e.entity_name} count={Number(e.event_count)} />)}
          </div>
        </fieldset>
      )}

      {/* ── מקומות ── */}
      {placeEntities.length > 0 && (
        <fieldset className="space-y-1">
          <legend className="text-xs text-gray-500 font-medium">מקומות</legend>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {placeEntities.map((e) => <EntityRow key={e.entity_name} name={e.entity_name} count={Number(e.event_count)} />)}
          </div>
        </fieldset>
      )}

      {/* ── שכבות ── */}
      {sources.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-xs text-gray-500 font-medium">שכבות</legend>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {sources.map((source) => (
              <label key={source.id} className="flex items-start gap-2 text-sm cursor-pointer">
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
                <span className="break-words min-w-0">{source.name}</span>
                <span className="text-gray-400 mr-auto text-xs shrink-0">({source.total_events})</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}
