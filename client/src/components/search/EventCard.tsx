import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Clock, MapPin, Users, CalendarDays, ChevronDown, ChevronUp, ExternalLink, Tag, BookOpen } from 'lucide-react';
import type { DiaryEvent } from '@/api/events';
import { getEventEntities, getEventMatches } from '@/api/events';
import { formatTime } from '@/lib/formatters';
import { useCalendarStore } from '@/stores/calendarStore';
import { useFilterStore } from '@/stores/filterStore';

interface EventCardProps {
  event: DiaryEvent;
}

const ROLE_LABEL: Record<string, string> = {
  owner: 'בעל היומן',
  participant: 'משתתף',
  location: 'מיקום',
  mentioned: 'מוזכר',
};

export function EventCard({ event }: EventCardProps) {
  const navigate = useNavigate();
  const setDate = useCalendarStore((s) => s.setDate);
  const { entity_names, setEntityNames } = useFilterStore();
  const [expanded, setExpanded] = useState(false);

  const openInCalendar = () => {
    setDate(event.event_date);
    navigate('/calendar');
  };

  // Fetch entities only when expanded
  const { data: entitiesData } = useQuery({
    queryKey: ['event-entities', event.id],
    queryFn: () => getEventEntities(event.id),
    enabled: expanded,
    staleTime: 5 * 60 * 1000,
  });
  const entities = entitiesData?.data ?? [];

  // Fetch matches only when expanded and match_group_id exists
  const { data: matchesData } = useQuery({
    queryKey: ['event-matches', event.id],
    queryFn: () => getEventMatches(event.id),
    enabled: expanded && !!event.match_group_id,
    staleTime: 5 * 60 * 1000,
  });
  const matchedEvents = matchesData?.matched_events ?? [];

  const personEntities = entities.filter((e) => e.entity_type === 'person');
  const orgEntities = entities.filter((e) => e.entity_type === 'organization');
  const placeEntities = entities.filter((e) => e.entity_type === 'place');

  const handleEntityClick = (name: string) => {
    const next = entity_names.includes(name)
      ? entity_names.filter((n) => n !== name)
      : [...entity_names, name];
    setEntityNames(next);
  };

  const otherFields = event.other_fields
    ? Object.entries(event.other_fields).filter(
        ([, v]) => v !== null && v !== undefined && v !== ''
      )
    : [];

  return (
    <div
      className="bg-white rounded-lg border border-gray-200 hover:shadow-sm transition-shadow"
      role="article"
      aria-label={event.title}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div
            className="w-1 self-stretch rounded-full shrink-0"
            style={{ backgroundColor: event.source_color || '#06607C' }}
            aria-hidden="true"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-base font-medium text-gray-900 mb-1 flex-1">{event.title}</h3>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={openInCalendar}
                  className="p-1 rounded text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                  title="פתח ביומן"
                  aria-label="פתח ביומן"
                >
                  <CalendarDays className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setExpanded((v) => !v)}
                  className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                  title={expanded ? 'הסתר פרטים' : 'הצג פרטים'}
                  aria-label={expanded ? 'הסתר פרטים' : 'הצג פרטים'}
                  aria-expanded={expanded}
                >
                  {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 text-sm text-gray-600">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                {formatTime(event.start_time)}
                {event.end_time && ` - ${formatTime(event.end_time)}`}
              </span>

              {event.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                  {event.location}
                </span>
              )}

              {event.participants && (
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="truncate max-w-[200px]">{event.participants}</span>
                </span>
              )}
            </div>

            <div className="mt-2 flex items-center gap-2">
              {event.dataset_link ? (
                <a
                  href={event.dataset_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-gray-500 hover:text-primary-700 hover:underline inline-flex items-center gap-1"
                >
                  {event.source_name || event.dataset_name}
                  <ExternalLink className="w-3 h-3" />
                </a>
              ) : (
                <span className="text-sm text-gray-500">{event.source_name || event.dataset_name}</span>
              )}
              {(event.match_count ?? 0) > 1 && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
                  {event.match_count} יומנים
                </span>
              )}
            </div>

            {/* Top entities chips (pre-loaded) */}
            {event.top_entities && event.top_entities.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {event.top_entities.map((e) => (
                  <button
                    key={e.name + e.type}
                    onClick={() => handleEntityClick(e.name)}
                    className={`text-xs px-1.5 py-0.5 rounded-full border transition-colors ${
                      entity_names.includes(e.name)
                        ? 'bg-primary-100 border-primary-300 text-primary-800'
                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-primary-50 hover:border-primary-200'
                    }`}
                  >
                    {e.type === 'person' ? '👤' : e.type === 'organization' ? '🏢' : '📍'} {e.name}
                  </button>
                ))}
              </div>
            )}

            {/* First 2 other_fields preview */}
            {otherFields.slice(0, 2).map(([key, value]) => (
              <div key={key} className="flex gap-2 text-xs text-gray-500 mt-0.5">
                <span className="shrink-0 text-gray-400">{key}:</span>
                <span className="truncate">{String(value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Expanded section */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-3 mr-4">
          {/* Other fields (skip first 2 already shown in card header) */}
          {otherFields.length > 2 && (
            <div className="space-y-1">
              {otherFields.slice(2).map(([key, value]) => (
                <div key={key} className="flex gap-2 text-sm">
                  <span className="text-gray-400 shrink-0 min-w-[80px]">{key}:</span>
                  <span className="text-gray-700 break-words">{String(value)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Entities */}
          {entities.length > 0 && (
            <div>
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
                          const isActive = entity_names.includes(entity.entity_name);
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
            <div>
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

        </div>
      )}
    </div>
  );
}
