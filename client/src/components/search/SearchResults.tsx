import { useNavigate } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import type { DiaryEvent } from '@/api/events';
import { EventCard } from './EventCard';
import { formatHebrewDate } from '@/lib/formatters';
import { useCalendarStore } from '@/stores/calendarStore';

interface SearchResultsProps {
  events: DiaryEvent[];
  total: number;
}

export function SearchResults({ events, total }: SearchResultsProps) {
  const navigate = useNavigate();
  const setDate = useCalendarStore((s) => s.setDate);

  const openDayInCalendar = (date: string) => {
    setDate(date);
    navigate('/calendar');
  };

  if (events.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500" role="status">
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
    <div role="region" aria-label="תוצאות חיפוש" aria-live="polite">
      <p className="text-sm text-gray-500 mb-4">
        נמצאו {total.toLocaleString('he-IL')} תוצאות
      </p>

      <div className="space-y-6">
        {[...grouped.entries()].map(([date, dateEvents]) => (
          <div key={date}>
            {/* Date header with calendar jump button */}
            <div className="flex items-center justify-between mb-2 sticky top-16 bg-gray-50 py-1 z-10">
              <h2 className="text-sm font-semibold text-gray-700">
                {formatHebrewDate(date)}
              </h2>
              <button
                onClick={() => openDayInCalendar(date)}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-primary-600 transition-colors px-1.5 py-0.5 rounded hover:bg-primary-50"
                title="פתח יום זה ביומן"
              >
                <CalendarDays className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">פתח ביומן</span>
              </button>
            </div>
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
