import { useMemo } from 'react';
import { isToday, toDateStr } from '@/lib/formatters';
import type { DiaryEvent } from '@/api/events';

const DAY_NAMES = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const MAX_EVENTS_DESKTOP = 3;
const MAX_EVENTS_MOBILE = 1;

interface MonthGridProps {
  date: string;
  events: DiaryEvent[];
  eventCounts: Record<string, number>;
  onDateClick: (date: string) => void;
  onEventClick?: (event: DiaryEvent) => void;
}

export function MonthGrid({ date, events, eventCounts, onDateClick, onEventClick }: MonthGridProps) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth();
  const today = toDateStr(new Date());

  // Build calendar grid cells
  const { weeks, currentMonth } = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // Start from Sunday of the first week
    const start = new Date(firstDay);
    start.setDate(start.getDate() - start.getDay());

    // End at Saturday of the last week
    const end = new Date(lastDay);
    end.setDate(end.getDate() + (6 - end.getDay()));

    const weeks: string[][] = [];
    let current = new Date(start);

    while (current <= end) {
      const week: string[] = [];
      for (let i = 0; i < 7; i++) {
        week.push(toDateStr(current));
        current.setDate(current.getDate() + 1);
      }
      weeks.push(week);
    }

    return { weeks, currentMonth: month };
  }, [year, month]);

  // Group events by day for display
  const eventsByDay = useMemo(() => {
    const map: Record<string, DiaryEvent[]> = {};
    for (const event of events) {
      const day = (event.event_date ?? event.start_time).split('T')[0];
      if (!map[day]) map[day] = [];
      map[day].push(event);
    }
    return map;
  }, [events]);

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50">
        {DAY_NAMES.map((day) => (
          <div key={day} className="py-2 text-center text-xs font-semibold text-gray-500">
            {day}
          </div>
        ))}
      </div>

      {/* Weeks */}
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 border-b border-gray-100 last:border-b-0">
          {week.map((dayStr) => {
            const dayDate = new Date(dayStr);
            const dayNum = dayDate.getDate();
            const isCurrentMonth = dayDate.getMonth() === currentMonth;
            const isTodayDate = dayStr === today;
            const dayEvents = eventsByDay[dayStr] || [];
            const count = eventCounts[dayStr] ?? dayEvents.length;

            return (
              <div
                key={dayStr}
                className={`min-h-[60px] sm:min-h-[100px] border-l border-gray-100 first:border-l-0 p-0.5 sm:p-1 cursor-pointer transition-colors hover:bg-gray-50 ${
                  !isCurrentMonth ? 'bg-gray-50/50' : ''
                } ${isTodayDate ? 'bg-primary-50/40' : ''}`}
                onClick={() => onDateClick(dayStr)}
              >
                {/* Day number */}
                <div className="flex items-center justify-end mb-0.5">
                  <span
                    className={`text-[10px] sm:text-xs w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full ${
                      isTodayDate
                        ? 'bg-primary-500 text-white font-bold'
                        : isCurrentMonth
                        ? 'text-gray-700'
                        : 'text-gray-300'
                    }`}
                  >
                    {dayNum}
                  </span>
                </div>

                {/* Event previews — show fewer on mobile */}
                <div className="space-y-0.5">
                  {/* Desktop: show up to 3 events */}
                  {dayEvents.slice(0, MAX_EVENTS_DESKTOP).map((event, idx) => {
                    const color = event.source_color || '#3B82F6';
                    return (
                      <div
                        key={event.id}
                        className={`text-[9px] sm:text-[10px] leading-tight truncate rounded px-0.5 sm:px-1 py-0.5 cursor-pointer hover:opacity-80 ${
                          idx >= MAX_EVENTS_MOBILE ? 'hidden sm:block' : ''
                        }`}
                        style={{
                          backgroundColor: `${color}15`,
                          color,
                          borderRight: `2px solid ${color}`,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onEventClick?.(event);
                        }}
                        title={event.title}
                      >
                        {event.title}
                      </div>
                    );
                  })}
                  {/* Desktop overflow */}
                  {count > MAX_EVENTS_DESKTOP && (
                    <div className="text-[10px] text-gray-400 pr-1 hidden sm:block">
                      +{count - MAX_EVENTS_DESKTOP} עוד
                    </div>
                  )}
                  {/* Mobile overflow */}
                  {count > MAX_EVENTS_MOBILE && (
                    <div className="text-[9px] text-gray-400 pr-0.5 sm:hidden">
                      +{count - MAX_EVENTS_MOBILE}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
