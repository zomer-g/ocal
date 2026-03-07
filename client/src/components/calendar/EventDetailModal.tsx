import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatTime, formatHebrewDate } from '@/lib/formatters';
import { X, MapPin, Users, Clock, ExternalLink, Calendar, Tag, BookOpen } from 'lucide-react';
import type { DiaryEvent } from '@/api/events';
import { getEventEntities, getEventMatches } from '@/api/events';
import { useCalendarStore } from '@/stores/calendarStore';

interface EventDetailModalProps {
  event: DiaryEvent;
  onClose: () => void;
}

const ENTITY_TYPE_LABEL: Record<string, string> = {
  person: 'אדם',
  organization: 'ארגון',
  place: 'מקום',
};

const ROLE_LABEL: Record<string, string> = {
  owner: 'בעל היומן',
  participant: 'משתתף',
  location: 'מיקום',
  mentioned: 'מוזכר',
};

export function EventDetailModal({ event, onClose }: EventDetailModalProps) {
  const color = event.source_color || '#06607C';
  const modalRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const { selectedEntityNames, setEntityNames } = useCalendarStore();

  const { data: entitiesData } = useQuery({
    queryKey: ['event-entities', event.id],
    queryFn: () => getEventEntities(event.id),
    staleTime: 5 * 60 * 1000,
  });
  const entities = entitiesData?.data ?? [];

  // Fetch matches only when match_group_id exists
  const { data: matchesData } = useQuery({
    queryKey: ['event-matches', event.id],
    queryFn: () => getEventMatches(event.id),
    enabled: !!event.match_group_id,
    staleTime: 5 * 60 * 1000,
  });
  const matchedEvents = matchesData?.matched_events ?? [];

  // Group entities by type
  const personEntities = entities.filter((e) => e.entity_type === 'person');
  const orgEntities = entities.filter((e) => e.entity_type === 'organization');
  const placeEntities = entities.filter((e) => e.entity_type === 'place');

  const handleEntityClick = (name: string) => {
    const next = selectedEntityNames.includes(name)
      ? selectedEntityNames.filter((n) => n !== name)
      : [...selectedEntityNames, name];
    setEntityNames(next);
    onClose();
  };

  // Render other_fields
  const otherFields = event.other_fields
    ? Object.entries(event.other_fields).filter(
        ([, v]) => v !== null && v !== undefined && v !== ''
      )
    : [];

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
        className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-xl border border-gray-200 w-[460px] max-w-[92vw] max-h-[85vh] overflow-y-auto"
      >
        {/* Color bar */}
        <div className="h-1.5 sticky top-0 z-10" style={{ backgroundColor: color }} aria-hidden="true" />

        {/* Header */}
        <div className="flex items-start justify-between p-4 pb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 id="event-modal-title" className="text-lg font-bold text-gray-900 leading-tight">{event.title}</h2>
              {(event.match_count ?? 0) > 1 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium shrink-0">
                  {event.match_count} יומנים
                </span>
              )}
            </div>
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

          {/* Other fields */}
          {otherFields.length > 0 && (
            <div className="space-y-1">
              {otherFields.map(([key, value]) => (
                <div key={key} className="flex gap-2 text-sm">
                  <span className="text-gray-400 shrink-0 min-w-[80px]">{key}:</span>
                  <span className="text-gray-700 break-words">{String(value)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Entities */}
          {entities.length > 0 && (
            <div className="border-t pt-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Tag className="w-3.5 h-3.5 text-gray-400" aria-hidden="true" />
                <span className="text-xs font-semibold text-gray-500">ישויות</span>
                <span className="text-xs text-gray-400">(לחץ לסינון)</span>
              </div>
              <div className="space-y-2">
                {[
                  { label: 'אנשים', list: personEntities },
                  { label: 'ארגונים', list: orgEntities },
                  { label: 'מקומות', list: placeEntities },
                ].map(({ label, list }) =>
                  list.length > 0 ? (
                    <div key={label}>
                      <div className="text-[10px] font-medium text-gray-400 mb-1">{label}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {list.map((entity) => {
                          const isActive = selectedEntityNames.includes(entity.entity_name);
                          return (
                            <button
                              key={entity.entity_name + entity.role}
                              onClick={() => handleEntityClick(entity.entity_name)}
                              title={`${ROLE_LABEL[entity.role] ?? entity.role} — לחץ לסינון`}
                              className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                                isActive
                                  ? 'bg-primary-100 border-primary-300 text-primary-800 font-medium'
                                  : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-primary-50 hover:border-primary-200 hover:text-primary-700'
                              }`}
                            >
                              {entity.entity_name}
                              {entity.role !== 'mentioned' && (
                                <span className="mr-1 opacity-60">· {ROLE_LABEL[entity.role] ?? entity.role}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null
                )}
              </div>
            </div>
          )}

          {/* Matched events from other diaries */}
          {matchedEvents.length > 0 && (
            <div className="border-t pt-3">
              <div className="flex items-center gap-1.5 mb-2">
                <BookOpen className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
                <span className="text-xs font-semibold text-amber-700">
                  מופיע גם ב-{matchedEvents.length} יומנים נוספים
                </span>
              </div>
              <div className="space-y-1.5">
                {matchedEvents.map((me) => (
                  <div key={me.id} className="flex items-start gap-2 text-sm">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 mt-1"
                      style={{ backgroundColor: me.source_color || '#06607C' }}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <div className="text-gray-700 font-medium text-xs">{me.source_name}</div>
                      <div className="text-gray-500 text-xs truncate">{me.title}</div>
                      {me.location && (
                        <div className="text-gray-400 text-xs truncate">{me.location}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
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
                צפה במקור
              </a>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
