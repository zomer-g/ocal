import { useEffect, useRef } from 'react';
import { formatTime, formatHebrewDate } from '@/lib/formatters';
import { X, MapPin, Users, Clock, ExternalLink, Calendar } from 'lucide-react';
import type { DiaryEvent } from '@/api/events';

interface EventDetailModalProps {
  event: DiaryEvent;
  onClose: () => void;
}

export function EventDetailModal({ event, onClose }: EventDetailModalProps) {
  const color = event.source_color || '#06607C';
  const modalRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement;
    closeRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'Tab') {
        const focusable = modalRef.current?.querySelectorAll<HTMLElement>(
          'button, a[href], input, [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-50" onClick={onClose} aria-hidden="true" />

      {/* Modal */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-modal-title"
        className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-xl border border-gray-200 w-[400px] max-w-[90vw] max-h-[80vh] overflow-hidden"
      >
        {/* Color bar */}
        <div className="h-1.5" style={{ backgroundColor: color }} aria-hidden="true" />

        {/* Header */}
        <div className="flex items-start justify-between p-4 pb-2">
          <div className="flex-1 min-w-0">
            <h2 id="event-modal-title" className="text-lg font-bold text-gray-900 leading-tight">{event.title}</h2>
          </div>
          <button
            ref={closeRef}
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors shrink-0 mr-2"
            aria-label="סגור"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="px-4 pb-4 space-y-3">
          {/* Date & Time */}
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Clock className="w-4 h-4 text-gray-400 shrink-0" aria-hidden="true" />
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
              <MapPin className="w-4 h-4 text-gray-400 shrink-0" aria-hidden="true" />
              <span>{event.location}</span>
            </div>
          )}

          {/* Participants */}
          {event.participants && (
            <div className="flex items-start gap-2 text-sm text-gray-600">
              <Users className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" aria-hidden="true" />
              <span className="whitespace-pre-wrap">{event.participants}</span>
            </div>
          )}

          {/* Source info */}
          <div className="border-t pt-3 mt-3">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
              <div className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: color }}
                  aria-hidden="true"
                />
                <span>{event.source_name || event.dataset_name}</span>
              </div>
            </div>
            {event.dataset_link && (
              <a
                href={event.dataset_link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-1.5 mr-5.5 text-xs text-primary-700 hover:underline"
              >
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
                צפה ב-ODATA
              </a>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
