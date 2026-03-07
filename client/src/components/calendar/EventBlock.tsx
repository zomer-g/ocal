import { useState, useRef } from 'react';
import { formatTime } from '@/lib/formatters';
import type { DiaryEvent } from '@/api/events';

interface EventBlockProps {
  event: DiaryEvent;
  top: number;       // px from top of the time grid
  height: number;    // px height
  column?: number;   // for overlapping events
  totalColumns?: number;
  onClick?: (event: DiaryEvent) => void;
}

export function EventBlock({ event, top, height, column = 0, totalColumns = 1, onClick }: EventBlockProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const color = event.source_color || '#06607C';
  const minHeight = Math.max(height, 22);
  const isCompact = minHeight < 40;

  // Calculate width and position for overlapping events
  const widthPercent = 100 / totalColumns;
  const rightPercent = column * widthPercent;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.(event);
    }
  };

  return (
    <div
      ref={ref}
      className="absolute rounded-md px-1.5 py-0.5 cursor-pointer transition-shadow hover:shadow-md overflow-hidden group"
      style={{
        top: `${top}px`,
        height: `${minHeight}px`,
        right: `${rightPercent}%`,
        width: `${widthPercent}%`,
        backgroundColor: `${color}20`,
        borderRight: `3px solid ${color}`,
        zIndex: column + 1,
      }}
      onClick={() => onClick?.(event)}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      role="button"
      tabIndex={0}
      aria-label={`${event.title}, ${formatTime(event.start_time)}`}
      onKeyDown={handleKeyDown}
    >
      {/* Match count badge */}
      {(event.match_count ?? 0) > 1 && (
        <div
          className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center z-10 shadow-sm"
          title={`מופיע ב-${event.match_count} יומנים`}
          aria-label={`מופיע ב-${event.match_count} יומנים`}
        >
          {event.match_count}
        </div>
      )}

      {isCompact ? (
        <div className="text-xs font-medium truncate leading-tight" style={{ color }}>
          {formatTime(event.start_time)} {event.title}
        </div>
      ) : (
        <>
          <div className="text-xs font-semibold truncate leading-tight" style={{ color }}>
            {event.title}
          </div>
          <div className="text-xs truncate opacity-80" style={{ color }}>
            {formatTime(event.start_time)}
            {event.end_time && ` - ${formatTime(event.end_time)}`}
          </div>
          {!isCompact && event.location && minHeight > 55 && (
            <div className="text-xs truncate opacity-60" style={{ color }}>
              {event.location}
            </div>
          )}
        </>
      )}

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-3 min-w-[220px] max-w-[300px] top-full mt-1 right-0 pointer-events-none">
          <div className="flex items-start gap-2">
            <div className="w-1 self-stretch rounded-full shrink-0 mt-0.5" style={{ backgroundColor: color }} aria-hidden="true" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900">{event.title}</div>
              <div className="text-xs text-gray-600 mt-1">
                {formatTime(event.start_time)}
                {event.end_time && ` - ${formatTime(event.end_time)}`}
              </div>
              {event.location && (
                <div className="text-xs text-gray-500 mt-0.5">{event.location}</div>
              )}
              {event.participants && (
                <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{event.participants}</div>
              )}
              {(event.match_count ?? 0) > 1 && (
                <div className="text-xs text-amber-600 mt-0.5 font-medium">
                  מופיע ב-{event.match_count} יומנים
                </div>
              )}
              {event.source_name && (
                <div className="text-xs text-gray-400 mt-1.5 border-t pt-1">
                  {event.source_name}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** All-day or events with no specific time */
export function AllDayEvent({ event, onClick }: { event: DiaryEvent; onClick?: (event: DiaryEvent) => void }) {
  const color = event.source_color || '#06607C';

  return (
    <div
      className="rounded px-1.5 py-0.5 text-xs font-medium truncate cursor-pointer hover:opacity-80 mb-0.5"
      style={{
        backgroundColor: `${color}20`,
        color,
        borderRight: `2px solid ${color}`,
      }}
      onClick={() => onClick?.(event)}
      title={event.title}
      role="button"
      tabIndex={0}
      aria-label={event.title}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.(event);
        }
      }}
    >
      {event.title}
    </div>
  );
}
