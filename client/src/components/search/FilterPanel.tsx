import { useQuery } from '@tanstack/react-query';
import { useFilterStore } from '@/stores/filterStore';
import { useSources } from '@/hooks/useSources';
import { HebrewDateInput } from '@/components/shared/HebrewDateInput';
import { getPublicEntities } from '@/api/events';

export function FilterPanel() {
  const {
    from_date, to_date, source_ids, entity_names, location, participants,
    setDateRange, setSourceIds, setEntityNames, setLocation, setParticipants,
  } = useFilterStore();
  const { data: sourcesData } = useSources();
  const sources = sourcesData?.data ?? [];

  // Fetch entities for current source selection
  const { data: entitiesData } = useQuery({
    queryKey: ['public-entities', source_ids],
    queryFn: () => getPublicEntities(source_ids.length ? source_ids : undefined),
    staleTime: 60 * 1000,
  });
  const entities = entitiesData?.data ?? [];
  const personEntities = entities.filter((e) => e.entity_type === 'person');
  const placeEntities = entities.filter((e) => e.entity_type === 'place');

  // Sort: selected entities first, then by event count
  const sortEntities = (list: typeof entities) => {
    return [...list].sort((a, b) => {
      const aSelected = entity_names.includes(a.entity_name) ? 1 : 0;
      const bSelected = entity_names.includes(b.entity_name) ? 1 : 0;
      if (aSelected !== bSelected) return bSelected - aSelected;
      return Number(b.event_count) - Number(a.event_count);
    });
  };

  const toggleEntity = (name: string) => {
    const next = entity_names.includes(name)
      ? entity_names.filter((n) => n !== name)
      : [...entity_names, name];
    setEntityNames(next);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4" role="region" aria-label="סינון תוצאות">
      <h3 className="text-sm font-semibold text-gray-700">סינון</h3>

      {/* Date range */}
      <fieldset className="space-y-2">
        <legend className="text-xs text-gray-500 font-medium">טווח תאריכים</legend>
        <div className="space-y-1.5">
          <div className="space-y-1">
            <label htmlFor="filter-from-date" className="text-xs text-gray-600">מתאריך</label>
            <HebrewDateInput
              id="filter-from-date"
              value={from_date}
              onChange={(val) => setDateRange(val, to_date)}
              placeholder="בחר תאריך התחלה"
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="filter-to-date" className="text-xs text-gray-600">עד תאריך</label>
            <HebrewDateInput
              id="filter-to-date"
              value={to_date}
              onChange={(val) => setDateRange(from_date, val)}
              placeholder="בחר תאריך סיום"
              className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
            />
          </div>
        </div>
      </fieldset>

      {/* Persons */}
      {personEntities.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-xs text-gray-500 font-medium">אנשים</legend>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {sortEntities(personEntities).map((entity) => (
              <label key={entity.entity_name} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={entity_names.includes(entity.entity_name)}
                  onChange={() => toggleEntity(entity.entity_name)}
                  className="rounded border-gray-300 text-primary-500"
                />
                <span className="truncate">{entity.entity_name}</span>
                <span className="text-gray-400 mr-auto text-xs">({entity.event_count})</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {/* Places */}
      {placeEntities.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-xs text-gray-500 font-medium">מקומות</legend>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {sortEntities(placeEntities).map((entity) => (
              <label key={entity.entity_name} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={entity_names.includes(entity.entity_name)}
                  onChange={() => toggleEntity(entity.entity_name)}
                  className="rounded border-gray-300 text-primary-500"
                />
                <span className="truncate">{entity.entity_name}</span>
                <span className="text-gray-400 mr-auto text-xs">({entity.event_count})</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {/* Sources */}
      {sources.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-xs text-gray-500 font-medium">שכבות</legend>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {sources.map((source) => (
              <label key={source.id} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={source_ids.includes(source.id)}
                  onChange={() => {
                    const next = source_ids.includes(source.id)
                      ? source_ids.filter((id) => id !== source.id)
                      : [...source_ids, source.id];
                    setSourceIds(next);
                  }}
                  className="rounded border-gray-300"
                  aria-label={source.name}
                />
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: source.color }}
                  aria-hidden="true"
                />
                <span className="truncate">{source.name}</span>
                <span className="text-gray-400 mr-auto text-xs">({source.total_events})</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {/* Location */}
      <div className="space-y-1">
        <label htmlFor="filter-location" className="text-xs text-gray-500">מיקום</label>
        <input
          id="filter-location"
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="חיפוש לפי מיקום..."
          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
        />
      </div>

      {/* Participants */}
      <div className="space-y-1">
        <label htmlFor="filter-participants" className="text-xs text-gray-500">משתתפים</label>
        <input
          id="filter-participants"
          type="text"
          value={participants}
          onChange={(e) => setParticipants(e.target.value)}
          placeholder="חיפוש לפי משתתפים..."
          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
        />
      </div>
    </div>
  );
}
