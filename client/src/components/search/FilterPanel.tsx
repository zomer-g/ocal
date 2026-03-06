import { useFilterStore } from '@/stores/filterStore';
import { useSources } from '@/hooks/useSources';
import { HebrewDateInput } from '@/components/shared/HebrewDateInput';

export function FilterPanel() {
  const { from_date, to_date, source_ids, location, participants, setDateRange, setSourceIds, setLocation, setParticipants } =
    useFilterStore();
  const { data: sourcesData } = useSources();
  const sources = sourcesData?.data ?? [];

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

      {/* Sources */}
      {sources.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-xs text-gray-500 font-medium">מקורות</legend>
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
