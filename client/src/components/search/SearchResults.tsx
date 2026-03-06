import type { DiaryEvent } from '@/api/events';
import { EventCard } from './EventCard';
import { formatHebrewDate } from '@/lib/formatters';

interface SearchResultsProps {
  events: DiaryEvent[];
  total: number;
}

export function SearchResults({ events, total }: SearchResultsProps) {
  if (events.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-lg">לא נמצאו תוצאות</p>
        <p className="text-sm mt-1">נסו לשנות את מילות החיפוש או המסננים</p>
      </div>
    );
  }

  // Group events by date
  const grouped = new Map<string, DiaryEvent[]>();
  for (const event of events) {
    const date = event.event_date;
    if (!grouped.has(date)) grouped.set(date, []);
    grouped.get(date)!.push(event);
  }

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        נמצאו {total.toLocaleString('he-IL')} תוצאות
      </p>

      <div className="space-y-6">
        {[...grouped.entries()].map(([date, dateEvents]) => (
          <div key={date}>
            <h2 className="text-sm font-semibold text-gray-700 mb-2 sticky top-16 bg-gray-50 py-1 z-10">
              {formatHebrewDate(date)}
            </h2>
            <div className="space-y-2">
              {dateEvents.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
