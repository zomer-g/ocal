import { Clock, MapPin, Users } from 'lucide-react';
import type { DiaryEvent } from '@/api/events';
import { formatTime } from '@/lib/formatters';

interface EventCardProps {
  event: DiaryEvent;
}

export function EventCard({ event }: EventCardProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start gap-3">
        <div
          className="w-1 self-stretch rounded-full shrink-0"
          style={{ backgroundColor: event.source_color || '#3B82F6' }}
        />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-gray-900 mb-1">{event.title}</h3>

          <div className="flex flex-wrap gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {formatTime(event.start_time)}
              {event.end_time && ` - ${formatTime(event.end_time)}`}
            </span>

            {event.location && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                {event.location}
              </span>
            )}

            {event.participants && (
              <span className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                <span className="truncate max-w-[200px]">{event.participants}</span>
              </span>
            )}
          </div>

          <div className="mt-2 text-xs text-gray-400">{event.source_name || event.dataset_name}</div>
        </div>
      </div>
    </div>
  );
}
