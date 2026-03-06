import { useRef, useEffect, useMemo } from 'react';
import { EventBlock, AllDayEvent } from './EventBlock';
import { formatHour, formatDayHeader, getTimePosition, getEventDuration, isToday, toDateStr } from '@/lib/formatters';
import type { DiaryEvent } from '@/api/events';
import type { CalendarView } from '@/stores/calendarStore';
import { useCalendarStore } from '@/stores/calendarStore';

const HOUR_HEIGHT = 60; // px per hour
const HOURS = Array.from({ length: 24 }, (_, i) => i);
const START_HOUR = 6; // Auto-scroll to 6am

interface TimeGridProps {
  date: string;
  view: CalendarView;
  events: DiaryEvent[];
  onEventClick?: (event: DiaryEvent) => void;
}

export function TimeGrid({ date, view, events, onEventClick }: TimeGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { setDate, setView } = useCalendarStore();

  // Calculate days to display
  const days = useMemo(() => {
    const result: string[] = [];
    const base = new Date(date);

    if (view === 'day') {
      result.push(toDateStr(base));
    } else if (view === '4day') {
      for (let i = 0; i < 4; i++) {
        const d = new Date(base);
        d.setDate(d.getDate() + i);
        result.push(toDateStr(d));
      }
    } else if (view === 'week') {
      // Start from Sunday
      const sunday = new Date(base);
      sunday.setDate(sunday.getDate() - sunday.getDay());
      for (let i = 0; i < 7; i++) {
        const d = new Date(sunday);
        d.setDate(d.getDate() + i);
        result.push(toDateStr(d));
      }
    }

    return result;
  }, [date, view]);

  // Group events by day
  const eventsByDay = useMemo(() => {
    const map: Record<string, DiaryEvent[]> = {};
    for (const day of days) {
      map[day] = [];
    }
    for (const event of events) {
      const eventDay = (event.event_date ?? event.start_time).split('T')[0];
      if (map[eventDay]) {
        map[eventDay].push(event);
      }
    }
    return map;
  }, [events, days]);

  // Separate all-day events from timed events
  const { allDayByDay, timedByDay } = useMemo(() => {
    const allDay: Record<string, DiaryEvent[]> = {};
    const timed: Record<string, DiaryEvent[]> = {};

    for (const day of days) {
      allDay[day] = [];
      timed[day] = [];

      for (const event of (eventsByDay[day] || [])) {
        const startHour = new Date(event.start_time).getHours();
        const startMin = new Date(event.start_time).getMinutes();
        // Treat events at midnight with no end time as all-day
        if (startHour === 0 && startMin === 0 && !event.end_time) {
          allDay[day].push(event);
        } else {
          timed[day].push(event);
        }
      }
    }

    return { allDayByDay: allDay, timedByDay: timed };
  }, [eventsByDay, days]);

  // Auto-scroll to business hours on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = START_HOUR * HOUR_HEIGHT;
    }
  }, [view, date]);

  const hasAllDayEvents = days.some(day => (allDayByDay[day]?.length ?? 0) > 0);

  return (
    <div className="bg-white rounded-lg border border-gray-200 flex flex-col h-[calc(100vh-160px)] sm:h-[calc(100vh-180px)]">
      {/* Day headers */}
      <div className="flex border-b border-gray-200 shrink-0">
        {/* Time gutter */}
        <div className="w-10 sm:w-16 shrink-0" />

        {/* Day columns headers */}
        {days.map((day) => {
          const today = isToday(day);
          return (
            <div
              key={day}
              className={`flex-1 text-center py-2 border-r border-gray-100 last:border-r-0 cursor-pointer hover:bg-gray-50 ${
                today ? 'bg-primary-50' : ''
              }`}
              onClick={() => { setDate(day); setView('day'); }}
            >
              <div className={`text-[10px] sm:text-xs font-medium ${today ? 'text-primary-600' : 'text-gray-500'}`}>
                {formatDayHeader(day)}
              </div>
              {today && (
                <div className="mx-auto mt-0.5 w-6 h-6 rounded-full bg-primary-500 text-white text-xs flex items-center justify-center font-bold">
                  {new Date(day).getDate()}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* All-day events section */}
      {hasAllDayEvents && (
        <div className="flex border-b border-gray-200 shrink-0">
          <div className="w-10 sm:w-16 shrink-0 text-[9px] sm:text-[10px] text-gray-400 text-center py-1">כל היום</div>
          {days.map((day) => (
            <div key={day} className="flex-1 border-r border-gray-100 last:border-r-0 p-1 min-h-[28px]">
              {(allDayByDay[day] || []).map((event) => (
                <AllDayEvent key={event.id} event={event} onClick={onEventClick} />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Scrollable time grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="flex relative" style={{ height: `${24 * HOUR_HEIGHT}px` }}>
          {/* Time labels gutter */}
          <div className="w-10 sm:w-16 shrink-0 relative">
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="absolute w-full text-left pr-1 sm:pr-2"
                style={{ top: `${hour * HOUR_HEIGHT}px` }}
              >
                <span className="text-[9px] sm:text-[11px] text-gray-400 relative -top-2">
                  {formatHour(hour)}
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day) => (
            <DayColumn
              key={day}
              day={day}
              events={timedByDay[day] || []}
              onEventClick={onEventClick}
            />
          ))}
        </div>

        {/* Current time indicator */}
        <CurrentTimeIndicator days={days} />
      </div>
    </div>
  );
}

/** A single day column in the time grid */
function DayColumn({
  day,
  events,
  onEventClick,
}: {
  day: string;
  events: DiaryEvent[];
  onEventClick?: (event: DiaryEvent) => void;
}) {
  const today = isToday(day);

  // Layout overlapping events
  const positioned = useMemo(() => layoutEvents(events), [events]);

  return (
    <div className={`flex-1 relative border-r border-gray-100 last:border-r-0 ${today ? 'bg-primary-50/30' : ''}`}>
      {/* Hour lines */}
      {HOURS.map((hour) => (
        <div
          key={hour}
          className="absolute w-full border-t border-gray-100"
          style={{ top: `${hour * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
        />
      ))}

      {/* Half-hour lines */}
      {HOURS.map((hour) => (
        <div
          key={`${hour}-half`}
          className="absolute w-full border-t border-gray-50"
          style={{ top: `${hour * HOUR_HEIGHT + HOUR_HEIGHT / 2}px` }}
        />
      ))}

      {/* Event blocks */}
      {positioned.map(({ event, top, height, column, totalColumns }) => (
        <EventBlock
          key={event.id}
          event={event}
          top={top}
          height={height}
          column={column}
          totalColumns={totalColumns}
          onClick={onEventClick}
        />
      ))}
    </div>
  );
}

/** Red line showing the current time — adapts to responsive gutter width */
function CurrentTimeIndicator({ days }: { days: string[] }) {
  const now = new Date();
  const todayStr = toDateStr(now);
  const dayIndex = days.indexOf(todayStr);

  if (dayIndex === -1) return null;

  const currentTime = now.getHours() + now.getMinutes() / 60;
  const top = currentTime * HOUR_HEIGHT;

  // The gutter is w-10 (40px) on mobile, w-16 (64px) on sm+.
  // We render both variants and toggle with responsive classes.
  return (
    <>
      {/* Mobile version (gutter = 40px) */}
      <div
        className="absolute z-10 pointer-events-none sm:hidden"
        style={{
          top: `${top}px`,
          right: `calc(40px + ${dayIndex} * (100% - 40px) / ${days.length})`,
          width: `calc((100% - 40px) / ${days.length})`,
        }}
      >
        <div className="relative">
          <div className="absolute right-0 w-2 h-2 rounded-full bg-red-500 -top-[3px]" />
          <div className="border-t-2 border-red-500 w-full" />
        </div>
      </div>
      {/* Desktop version (gutter = 64px) */}
      <div
        className="absolute z-10 pointer-events-none hidden sm:block"
        style={{
          top: `${top}px`,
          right: `calc(64px + ${dayIndex} * (100% - 64px) / ${days.length})`,
          width: `calc((100% - 64px) / ${days.length})`,
        }}
      >
        <div className="relative">
          <div className="absolute right-0 w-2.5 h-2.5 rounded-full bg-red-500 -top-[4px]" />
          <div className="border-t-2 border-red-500 w-full" />
        </div>
      </div>
    </>
  );
}

// ────────────────────────────────────────────
// Event layout algorithm (handle overlapping)
// ────────────────────────────────────────────

interface PositionedEvent {
  event: DiaryEvent;
  top: number;
  height: number;
  column: number;
  totalColumns: number;
}

function layoutEvents(events: DiaryEvent[]): PositionedEvent[] {
  if (events.length === 0) return [];

  // Sort by start time, then by duration (longer first)
  const sorted = [...events].sort((a, b) => {
    const aStart = getTimePosition(a.start_time);
    const bStart = getTimePosition(b.start_time);
    if (aStart !== bStart) return aStart - bStart;
    const aDur = getEventDuration(a.start_time, a.end_time);
    const bDur = getEventDuration(b.start_time, b.end_time);
    return bDur - aDur;
  });

  // Build collision groups
  const groups: Array<{
    event: DiaryEvent;
    startY: number;
    endY: number;
    column: number;
  }[]> = [];

  for (const event of sorted) {
    const startY = getTimePosition(event.start_time) * HOUR_HEIGHT;
    const duration = getEventDuration(event.start_time, event.end_time);
    const endY = startY + duration * HOUR_HEIGHT;

    const entry = { event, startY, endY, column: 0 };

    // Try to find existing group this event overlaps with
    let placed = false;
    for (const group of groups) {
      const overlaps = group.some(g => startY < g.endY && endY > g.startY);
      if (overlaps) {
        // Find first available column
        const usedColumns = new Set(group.filter(g => startY < g.endY && endY > g.startY).map(g => g.column));
        let col = 0;
        while (usedColumns.has(col)) col++;
        entry.column = col;
        group.push(entry);
        placed = true;
        break;
      }
    }

    if (!placed) {
      groups.push([entry]);
    }
  }

  // Convert groups to positioned events
  const result: PositionedEvent[] = [];
  for (const group of groups) {
    const totalColumns = Math.max(...group.map(g => g.column)) + 1;
    for (const g of group) {
      result.push({
        event: g.event,
        top: g.startY,
        height: g.endY - g.startY,
        column: g.column,
        totalColumns,
      });
    }
  }

  return result;
}
