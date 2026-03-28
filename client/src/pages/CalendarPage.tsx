import { useState, useEffect, useMemo } from 'react';
import { useCalendarStore } from '@/stores/calendarStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useCalendar } from '@/hooks/useCalendar';
import { useSources } from '@/hooks/useSources';
import { CalendarHeader, TimeGrid, MonthGrid, LayerPanel, EventDetailModal } from '@/components/calendar';
import { Loader2, Layers, X } from 'lucide-react';
import type { DiaryEvent } from '@/api/events';

export function CalendarPage() {
  const { date, view, setDate, setView, enabledSourceIds, selectedEntityNames, setAllSources, sourcesInitialized } = useCalendarStore();
  const { hideFutureEvents } = useSettingsStore();
  const { data: sourcesData } = useSources();
  const sources = sourcesData?.data ?? [];
  const [selectedEvent, setSelectedEvent] = useState<DiaryEvent | null>(null);
  const [mobileLayersOpen, setMobileLayersOpen] = useState(false);

  // Initialize all sources as enabled on first load
  useEffect(() => {
    if (sources.length > 0 && !sourcesInitialized) {
      setAllSources(sources.map((s) => s.id), true);
    }
  }, [sources, sourcesInitialized, setAllSources]);

  // Build source_ids param for API.
  // When all sources are enabled (or none toggled yet), omit the param entirely —
  // the backend returns all enabled sources by default, and sending 600+ UUIDs
  // as a query string exceeds URL length limits (~22KB).
  const allEnabled = sources.length > 0 && enabledSourceIds.size === sources.length;
  const sourceIdsParam = enabledSourceIds.size > 0 && !allEnabled
    ? Array.from(enabledSourceIds).join(',')
    : undefined;

  const entityNamesParam = selectedEntityNames.length > 0
    ? selectedEntityNames.join(',')
    : undefined;

  const today = new Date().toISOString().split('T')[0];
  const { data, isLoading } = useCalendar({
    date,
    view,
    source_ids: sourceIdsParam,
    entity_names: entityNamesParam,
    max_date: hideFutureEvents ? today : undefined,
  });

  // All events from API (before client-side source filtering)
  const allEvents = data?.events ?? [];

  // Filter events client-side as well (for instant toggle response)
  const filteredEvents = allEvents.filter(
    (e) => enabledSourceIds.has(e.source_id)
  );

  // Compute per-source event counts for current view (from all events, not just filtered)
  const viewSourceCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const event of allEvents) {
      counts[event.source_id] = (counts[event.source_id] || 0) + 1;
    }
    return counts;
  }, [allEvents]);

  const handleDateClick = (clickedDate: string) => {
    setDate(clickedDate);
    setView('day');
  };

  const handleEventClick = (event: DiaryEvent) => {
    setSelectedEvent(event);
  };

  // Close mobile drawer on Escape
  useEffect(() => {
    if (!mobileLayersOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileLayersOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [mobileLayersOpen]);

  return (
    <div className="max-w-full mx-auto px-2 sm:px-4 md:px-6 lg:px-8 py-2 sm:py-4">
      {/* Calendar Header with navigation & view switcher */}
      <CalendarHeader />

      {/* Mobile layers toggle */}
      {sources.length > 0 && (
        <button
          onClick={() => setMobileLayersOpen(true)}
          className="lg:hidden mb-3 flex items-center gap-2 text-sm text-primary-700 hover:text-primary-800 px-3 py-2 border border-primary-200 rounded-lg"
          aria-expanded={mobileLayersOpen}
          aria-label="פתח שכבות"
        >
          <Layers className="w-4 h-4" />
          שכבות ({enabledSourceIds.size}/{sources.length})
        </button>
      )}

      {/* Mobile layers drawer */}
      {mobileLayersOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex" role="dialog" aria-modal="true" aria-label="שכבות">
          <div className="fixed inset-0 bg-black/30" aria-hidden="true" onClick={() => setMobileLayersOpen(false)} />
          <div className="relative w-72 max-w-[80vw] bg-gray-50 mr-auto shadow-xl overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-gray-400" aria-hidden="true" />
                <span className="text-sm font-semibold text-gray-700">שכבות</span>
              </div>
              <button
                onClick={() => setMobileLayersOpen(false)}
                className="p-1 rounded hover:bg-gray-100"
                aria-label="סגור שכבות"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-3">
              <LayerPanel sources={sources} viewSourceCounts={viewSourceCounts} />
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-4">
        {/* Desktop layer panel sidebar — on the right (first in RTL) like search page */}
        <aside className="w-64 shrink-0 hidden lg:block">
          <LayerPanel sources={sources} viewSourceCounts={viewSourceCounts} />
        </aside>

        {/* Main calendar area */}
        <div className="flex-1 min-w-0">
          {isLoading && !data ? (
            <div className="flex items-center justify-center py-32" role="status" aria-live="polite">
              <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
            </div>
          ) : view === 'month' ? (
            <MonthGrid
              date={date}
              events={filteredEvents}
              eventCounts={data?.event_counts ?? {}}
              onDateClick={handleDateClick}
              onEventClick={handleEventClick}
            />
          ) : (
            <TimeGrid
              date={date}
              view={view}
              events={filteredEvents}
              onEventClick={handleEventClick}
            />
          )}
        </div>
      </div>

      {/* Event detail modal */}
      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}
