import { useFilterStore } from '@/stores/filterStore';
import { useSources } from '@/hooks/useSources';
import { HebrewDateInput } from '@/components/shared/HebrewDateInput';

export function FilterPanel() {
  const { from_date, to_date, source_ids, location, participants, setDateRange, setSourceIds, setLocation, setParticipants } =
    useFilterStore();
  const { data: sourcesData } = useSources();
  const sources = sourcesData?.data ?? [];

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
      <h3 className="text-sm font-semibold text-gray-700">סינון</h3>

      {/* Date range */}
      <div className="space-y-2">
        <label className="text-xs text-gray-500">טווח תאריכים</label>
        <div className="flex gap-2 items-center">
          <HebrewDateInput
            value={from_date}
            onChange={(val) => setDateRange(val, to_date)}
            placeholder="מתאריך"
            className="flex-1 text-sm border border-gray-300 rounded px-2 py-1.5 text-center"
          />
          <span className="text-gray-400">-</span>
          <HebrewDateInput
            value={to_date}
            onChange={(val) => setDateRange(from_date, val)}
            placeholder="עד תאריך"
            className="flex-1 text-sm border border-gray-300 rounded px-2 py-1.5 text-center"
          />
        </div>
      </div>

      {/* Sources */}
      {sources.length > 0 && (
        <div className="space-y-2">
          <label className="text-xs text-gray-500">מקורות</label>
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
                />
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: source.color }}
                />
                <span className="truncate">{source.name}</span>
                <span className="text-gray-400 mr-auto text-xs">({source.total_events})</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Location */}
      <div className="space-y-1">
        <label className="text-xs text-gray-500">מיקום</label>
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="חיפוש לפי מיקום..."
          className="w-full text-sm border border-gray-300 rounded px-2 py-1.5"
        />
      </div>

      {/* Participants */}
      <div className="space-y-1">
        <label className="text-xs text-gray-500">משתתפים</label>
        <input
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
