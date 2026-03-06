import { formatTime, formatHebrewDate } from '@/lib/formatters';
import { X, MapPin, Users, Clock, ExternalLink, Calendar } from 'lucide-react';
import type { DiaryEvent } from '@/api/events';

interface EventDetailModalProps {
  event: DiaryEvent;
  onClose: () => void;
}

export function EventDetailModal({ event, onClose }: EventDetailModalProps) {
  const color = event.source_color || '#3B82F6';

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-50" onClick={onClose} />

      {/* Modal */}
      <div className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-xl border border-gray-200 w-[400px] max-w-[90vw] max-h-[80vh] overflow-hidden">
        {/* Color bar */}
        <div className="h-1.5" style={{ backgroundColor: color }} />

        {/* Header */}
        <div className="flex items-start justify-between p-4 pb-2">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-gray-900 leading-tight">{event.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors shrink-0 mr-2"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="px-4 pb-4 space-y-3">
          {/* Date & Time */}
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Clock className="w-4 h-4 text-gray-400 shrink-0" />
            <div>
              <div>{formatHebrewDate(event.start_time)}</div>
              <div className="text-gray-500">
                {formatTime(event.start_time)}
                {event.end_time && ` - ${formatTime(event.end_time)}`}
              </div>
            </div>
          </div>

          {/* Location */}
          {event.location && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
              <span>{event.location}</span>
            </div>
          )}

          {/* Participants */}
          {event.participants && (
            <div className="flex items-start gap-2 text-sm text-gray-600">
              <Users className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
              <span className="whitespace-pre-wrap">{event.participants}</span>
            </div>
          )}

          {/* Source info */}
          <div className="border-t pt-3 mt-3">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Calendar className="w-3.5 h-3.5" />
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span>{event.source_name || event.dataset_name}</span>
              </div>
            </div>
            {event.dataset_link && (
              <a
                href={event.dataset_link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-1.5 mr-5.5 text-xs text-primary-500 hover:underline"
              >
                <ExternalLink className="w-3 h-3" />
                צפה ב-ODATA
              </a>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
