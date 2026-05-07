import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Trash2, Save, Sparkles, Loader2, AlertCircle, CheckCircle2,
  ChevronLeft, ChevronRight, CalendarDays,
} from 'lucide-react';
import {
  saveDraftEvents,
  extractFromPdf,
  commitManualUpload,
  type DraftEvent,
  type LLMProvider,
  type ManualUpload,
} from '@/api/manualUploads';
import { getAdminSources, getPeople } from '@/api/admin';
import {
  format, addDays, addMonths, startOfWeek as dfStartOfWeek,
  startOfMonth, endOfMonth, parseISO, isSameDay, isValid,
} from 'date-fns';
import { he } from 'date-fns/locale';

interface Props {
  upload: ManualUpload;
  currentPdfPage: number;
  onCommitted: (sourceId: string) => void;
}

type ViewMode = 'daily' | '4day' | 'weekly' | 'monthly';

const VIEW_MODES: { value: ViewMode; label: string }[] = [
  { value: 'daily', label: 'יומי' },
  { value: '4day', label: '4 ימים' },
  { value: 'weekly', label: 'שבועי' },
  { value: 'monthly', label: 'חודשי' },
];

const PROVIDER_LABEL: Record<NonNullable<DraftEvent['provider']>, string> = {
  manual: 'ידני',
  claude: 'Claude',
  gpt4o: 'GPT-4o',
};

const PROVIDER_BADGE_CLASS: Record<NonNullable<DraftEvent['provider']>, string> = {
  manual: 'bg-gray-100 text-gray-700 border-gray-300',
  claude: 'bg-violet-100 text-violet-800 border-violet-300',
  gpt4o: 'bg-emerald-100 text-emerald-800 border-emerald-300',
};

// ─────────────────────────────────────────────
// Date helpers (all dates treated as Asia/Jerusalem-local;
// datetime-local inputs are naive strings YYYY-MM-DDTHH:mm)
// ─────────────────────────────────────────────

function dateKeyOf(local: string | null | undefined): string {
  if (!local) return '';
  return local.slice(0, 10); // YYYY-MM-DD
}

function timeOf(local: string | null | undefined): string {
  if (!local) return '';
  // local: "YYYY-MM-DDTHH:mm[:ss][TZ]" — return "HH:mm"
  const match = local.match(/T(\d{2}:\d{2})/);
  return match ? match[1] : '';
}

function combineDateTime(date: Date, time: string): string {
  // date → YYYY-MM-DD, time → HH:mm. Returns naive YYYY-MM-DDTHH:mm.
  const dateStr = format(date, 'yyyy-MM-dd');
  return `${dateStr}T${time || '00:00'}`;
}

function setTimeOnIso(iso: string | null | undefined, time: string): string | null {
  if (!time) return null;
  const date = (iso && iso.slice(0, 10)) || format(new Date(), 'yyyy-MM-dd');
  return `${date}T${time}`;
}

/** Sunday-anchored week start (Israel convention). */
function startOfWeekHE(d: Date): Date {
  return dfStartOfWeek(d, { weekStartsOn: 0 });
}

function visibleDates(viewMode: ViewMode, viewDate: Date): Date[] {
  if (viewMode === 'daily') return [viewDate];
  if (viewMode === '4day') return Array.from({ length: 4 }, (_, i) => addDays(viewDate, i));
  if (viewMode === 'weekly') {
    const start = startOfWeekHE(viewDate);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }
  // monthly: full month, padded to whole weeks
  const monthStart = startOfMonth(viewDate);
  const monthEnd = endOfMonth(viewDate);
  const gridStart = startOfWeekHE(monthStart);
  const dates: Date[] = [];
  let cursor = gridStart;
  while (cursor <= monthEnd || dates.length % 7 !== 0) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
    if (dates.length > 42) break; // safety
  }
  return dates;
}

function shiftViewDate(viewMode: ViewMode, viewDate: Date, dir: 1 | -1): Date {
  if (viewMode === 'daily') return addDays(viewDate, dir);
  if (viewMode === '4day') return addDays(viewDate, dir * 4);
  if (viewMode === 'weekly') return addDays(viewDate, dir * 7);
  return addMonths(viewDate, dir);
}

function emptyEventForDate(date: Date, page: number): DraftEvent {
  return {
    title: '',
    start_time: combineDateTime(date, '09:00'),
    end_time: null,
    location: null,
    participants: null,
    notes: null,
    source_page: page > 0 ? page : null,
    provider: 'manual',
  };
}

function parseDateKey(key: string): Date | null {
  if (!key) return null;
  const d = parseISO(key);
  return isValid(d) ? d : null;
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export function ManualEventEditor({ upload, currentPdfPage, onCommitted }: Props) {
  const queryClient = useQueryClient();
  const [events, setEvents] = useState<DraftEvent[]>(upload.draft_events ?? []);
  const [selectedProvider, setSelectedProvider] = useState<LLMProvider>('claude');
  const [viewMode, setViewMode] = useState<ViewMode>('daily');
  const [viewDate, setViewDate] = useState<Date>(() => {
    // If existing events, anchor view on the earliest event's date
    const first = (upload.draft_events ?? []).find((e) => e.start_time);
    const d = first ? parseDateKey(dateKeyOf(first.start_time)) : null;
    return d ?? new Date();
  });

  const [sourceMode, setSourceMode] = useState<'new' | 'existing'>('new');
  const [sourceId, setSourceId] = useState<string>('');
  const [newSource, setNewSource] = useState({
    name: upload.filename.replace(/\.pdf$/i, ''),
    color: '#06607C',
    person_id: '',
    organization_id: '',
    dataset_link: '',
  });
  const [runEntityExtraction, setRunEntityExtraction] = useState(true);
  const [error, setError] = useState<string>('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Reset on upload swap
  useEffect(() => {
    setEvents(upload.draft_events ?? []);
  }, [upload.id]);

  const { data: sourcesResp } = useQuery({
    queryKey: ['admin', 'sources'],
    queryFn: getAdminSources,
  });
  const { data: peopleResp } = useQuery({
    queryKey: ['admin', 'people'],
    queryFn: getPeople,
  });

  const sources = sourcesResp?.data ?? [];
  const people = peopleResp?.data ?? [];

  // Autosave: debounce 800ms after last edit
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipFirstSaveRef = useRef(true);
  useEffect(() => {
    if (skipFirstSaveRef.current) {
      skipFirstSaveRef.current = false;
      return;
    }
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      setSaveStatus('saving');
      saveDraftEvents(upload.id, events)
        .then(() => {
          setSaveStatus('saved');
          setTimeout(() => setSaveStatus('idle'), 1500);
        })
        .catch((err: Error) => {
          setError(`שמירה אוטומטית נכשלה: ${err.message}`);
          setSaveStatus('idle');
        });
    }, 800);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [events, upload.id]);

  const extractMutation = useMutation({
    mutationFn: (provider: LLMProvider) => extractFromPdf(upload.id, provider),
    onSuccess: (resp) => {
      setEvents((prev) => [
        ...prev,
        ...resp.events.map((e) => ({ ...e, provider: resp.provider })),
      ]);
      // Anchor view on the earliest extracted date for visibility
      const earliest = resp.events
        .map((e) => parseDateKey(dateKeyOf(e.start_time)))
        .filter((d): d is Date => !!d)
        .sort((a, b) => a.getTime() - b.getTime())[0];
      if (earliest) setViewDate(earliest);
      setError('');
    },
    onError: (err: Error) => setError(`חילוץ נכשל: ${err.message}`),
  });

  const commitMutation = useMutation({
    mutationFn: () =>
      commitManualUpload(upload.id, {
        source_id: sourceMode === 'existing' && sourceId ? sourceId : undefined,
        source:
          sourceMode === 'new'
            ? {
                name: newSource.name.trim(),
                color: newSource.color,
                person_id: newSource.person_id || null,
                organization_id: newSource.organization_id || null,
                dataset_link: newSource.dataset_link.trim() || null,
              }
            : undefined,
        events,
        run_entity_extraction: runEntityExtraction,
      }),
    onSuccess: (resp) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'sources'] });
      onCommitted(resp.source_id);
    },
    onError: (err: Error) => setError(err.message),
  });

  const validate = (): string | null => {
    if (events.length === 0) return 'יש להוסיף לפחות אירוע אחד לפני שמירה';
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (!e.title.trim()) return `אירוע #${i + 1}: חסרה כותרת`;
      if (!e.start_time) return `אירוע #${i + 1}: חסר זמן התחלה`;
    }
    if (sourceMode === 'new' && !newSource.name.trim()) return 'יש לתת שם למקור החדש';
    if (sourceMode === 'existing' && !sourceId) return 'יש לבחור מקור קיים';
    return null;
  };

  const handleCommit = () => {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setError('');
    commitMutation.mutate();
  };

  // Mutation helpers
  const updateEventAt = useCallback((idx: number, patch: Partial<DraftEvent>) => {
    setEvents((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  }, []);

  const removeEventAt = useCallback((idx: number) => {
    setEvents((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const addEventForDate = useCallback((date: Date) => {
    setEvents((prev) => [...prev, emptyEventForDate(date, currentPdfPage)]);
  }, [currentPdfPage]);

  const dates = useMemo(() => visibleDates(viewMode, viewDate), [viewMode, viewDate]);

  // Group events by their date key, plus a "no-date" bucket for events
  // whose start_time is empty or unparseable
  const eventsByDate = useMemo(() => {
    const map: Record<string, { event: DraftEvent; idx: number }[]> = {};
    events.forEach((e, idx) => {
      const key = dateKeyOf(e.start_time);
      (map[key] = map[key] ?? []).push({ event: e, idx });
    });
    // Sort each day's events by start time
    Object.values(map).forEach((arr) => arr.sort((a, b) => (a.event.start_time ?? '').localeCompare(b.event.start_time ?? '')));
    return map;
  }, [events]);

  const orphanEvents = eventsByDate[''] ?? [];

  // ─── Provider-tag chips ───
  const claudeCount = useMemo(() => events.filter((e) => e.provider === 'claude').length, [events]);
  const gpt4oCount = useMemo(() => events.filter((e) => e.provider === 'gpt4o').length, [events]);
  const manualCount = useMemo(() => events.filter((e) => !e.provider || e.provider === 'manual').length, [events]);

  const isCommitted = !!upload.committed_at;

  return (
    <div className="flex flex-col h-full bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-col gap-2 p-3 bg-gray-50 border-b border-gray-200 shrink-0">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value as LLMProvider)}
              className="text-sm border border-gray-300 rounded px-2 py-1 bg-white"
              dir="rtl"
              disabled={isCommitted}
            >
              <option value="claude">Claude (PDF native)</option>
              <option value="gpt4o">GPT-4o (vision)</option>
            </select>
            <button
              type="button"
              onClick={() => extractMutation.mutate(selectedProvider)}
              disabled={extractMutation.isPending || isCommitted}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-primary-700 text-white rounded hover:bg-primary-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {extractMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {extractMutation.isPending ? 'מחלץ...' : 'מלא אוטומטית'}
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs text-gray-500">
            {saveStatus === 'saving' && <span className="inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />שומר...</span>}
            {saveStatus === 'saved' && <span className="inline-flex items-center gap-1 text-green-600"><CheckCircle2 className="w-3 h-3" />נשמר</span>}
          </div>
        </div>

        {/* View mode + date pager */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="inline-flex rounded-md border border-gray-300 bg-white">
            {VIEW_MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setViewMode(m.value)}
                className={`px-2 py-1 text-xs first:rounded-r-md last:rounded-l-md border-l first:border-l-0 border-gray-200 ${
                  viewMode === m.value ? 'bg-primary-700 text-white' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="inline-flex items-center gap-1 text-sm">
            <button
              type="button"
              onClick={() => setViewDate(shiftViewDate(viewMode, viewDate, -1))}
              className="p-1 rounded hover:bg-gray-200"
              aria-label="קודם"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewDate(new Date())}
              className="px-2 py-0.5 text-xs rounded hover:bg-gray-200 inline-flex items-center gap-1"
            >
              <CalendarDays className="w-3.5 h-3.5" /> היום
            </button>
            <button
              type="button"
              onClick={() => setViewDate(shiftViewDate(viewMode, viewDate, 1))}
              className="p-1 rounded hover:bg-gray-200"
              aria-label="הבא"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-medium text-gray-900 mr-2 ml-1">
              {viewMode === 'monthly'
                ? format(viewDate, 'MMMM yyyy', { locale: he })
                : viewMode === 'daily'
                ? format(viewDate, "EEEE, d בMMMM yyyy", { locale: he })
                : `${format(dates[0], 'd בMMM', { locale: he })} – ${format(dates[dates.length - 1], 'd בMMM yyyy', { locale: he })}`}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="text-gray-600">סה"כ {events.length} אירועים:</span>
          {manualCount > 0 && <span className={`px-1.5 py-0.5 rounded border ${PROVIDER_BADGE_CLASS.manual}`}>ידני: {manualCount}</span>}
          {claudeCount > 0 && <span className={`px-1.5 py-0.5 rounded border ${PROVIDER_BADGE_CLASS.claude}`}>Claude: {claudeCount}</span>}
          {gpt4oCount > 0 && <span className={`px-1.5 py-0.5 rounded border ${PROVIDER_BADGE_CLASS.gpt4o}`}>GPT-4o: {gpt4oCount}</span>}
          {orphanEvents.length > 0 && <span className="px-1.5 py-0.5 rounded border bg-amber-50 text-amber-800 border-amber-200">בלי תאריך: {orphanEvents.length}</span>}
        </div>
      </div>

      {/* Body — view-mode specific */}
      <div className="flex-1 overflow-auto">
        {viewMode === 'monthly' ? (
          <MonthlyView
            dates={dates}
            viewDate={viewDate}
            eventsByDate={eventsByDate}
            isCommitted={isCommitted}
            onAddEvent={addEventForDate}
            onSelectDay={(d) => { setViewMode('daily'); setViewDate(d); }}
          />
        ) : (
          <DayColumns
            dates={dates}
            eventsByDate={eventsByDate}
            isCommitted={isCommitted}
            onUpdate={updateEventAt}
            onRemove={removeEventAt}
            onAddEvent={addEventForDate}
          />
        )}

        {orphanEvents.length > 0 && (
          <div className="border-t border-amber-200 bg-amber-50 p-3">
            <div className="text-xs font-semibold text-amber-800 mb-2">
              אירועים ללא תאריך תקין — תקנו את התאריך/שעה כדי שיוצגו ביומן:
            </div>
            <div className="space-y-2">
              {orphanEvents.map(({ event, idx }) => (
                <CompactEventCard
                  key={idx}
                  event={event}
                  idx={idx}
                  isCommitted={isCommitted}
                  showDate
                  onUpdate={updateEventAt}
                  onRemove={removeEventAt}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom commit panel */}
      {!isCommitted && (
        <div className="border-t border-gray-200 bg-gray-50 p-3 space-y-3 shrink-0">
          <div className="flex items-center gap-3 text-sm">
            <label className="inline-flex items-center gap-1">
              <input type="radio" checked={sourceMode === 'new'} onChange={() => setSourceMode('new')} />
              צור מקור חדש
            </label>
            <label className="inline-flex items-center gap-1">
              <input type="radio" checked={sourceMode === 'existing'} onChange={() => setSourceMode('existing')} />
              שייך למקור קיים
            </label>
          </div>

          {sourceMode === 'new' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input
                value={newSource.name}
                onChange={(e) => setNewSource((s) => ({ ...s, name: e.target.value }))}
                placeholder="שם המקור (לדוגמה: יומן ראש הממשלה - ינואר 2024)"
                className="md:col-span-2 text-sm border border-gray-300 rounded px-2 py-1"
                dir="rtl"
              />
              <select
                value={newSource.person_id}
                onChange={(e) => setNewSource((s) => ({ ...s, person_id: e.target.value }))}
                className="text-sm border border-gray-300 rounded px-2 py-1 bg-white"
                dir="rtl"
              >
                <option value="">בעל היומן (אופציונלי)</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input
                type="color"
                value={newSource.color}
                onChange={(e) => setNewSource((s) => ({ ...s, color: e.target.value }))}
                className="h-8 w-full border border-gray-300 rounded"
                aria-label="צבע"
              />
              <input
                value={newSource.dataset_link}
                onChange={(e) => setNewSource((s) => ({ ...s, dataset_link: e.target.value }))}
                placeholder="קישור למסמך המקור (אופציונלי)"
                className="md:col-span-2 text-sm border border-gray-300 rounded px-2 py-1"
                dir="ltr"
              />
            </div>
          ) : (
            <select
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded px-2 py-1 bg-white"
              dir="rtl"
            >
              <option value="">— בחר מקור —</option>
              {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={runEntityExtraction}
              onChange={(e) => setRunEntityExtraction(e.target.checked)}
            />
            הרץ חילוץ ישויות אחרי השמירה (אנשים / ארגונים / מקומות)
          </label>

          {error && (
            <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleCommit}
            disabled={commitMutation.isPending}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary-700 text-white font-semibold rounded hover:bg-primary-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {commitMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            שמור הכל ({events.length} אירועים)
          </button>
        </div>
      )}

      {isCommitted && (
        <div className="border-t border-gray-200 bg-green-50 p-3 text-sm text-green-800 inline-flex items-center gap-2 shrink-0">
          <CheckCircle2 className="w-4 h-4" />
          העלאה זו כבר נשמרה ב-{new Date(upload.committed_at!).toLocaleString('he-IL')}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Day-columns view (daily, 4-day, weekly)
// ─────────────────────────────────────────────

interface DayColumnsProps {
  dates: Date[];
  eventsByDate: Record<string, { event: DraftEvent; idx: number }[]>;
  isCommitted: boolean;
  onUpdate: (idx: number, patch: Partial<DraftEvent>) => void;
  onRemove: (idx: number) => void;
  onAddEvent: (date: Date) => void;
}

function DayColumns({ dates, eventsByDate, isCommitted, onUpdate, onRemove, onAddEvent }: DayColumnsProps) {
  // For daily (1 col) we render full-width cards; for multi-day we render compact cards.
  const compact = dates.length > 1;
  return (
    <div
      className={`grid gap-2 p-2 ${
        dates.length === 1 ? 'grid-cols-1' :
        dates.length <= 4 ? `grid-cols-${dates.length}` :
        'grid-cols-7'
      }`}
      style={dates.length > 4 ? undefined : { gridTemplateColumns: `repeat(${dates.length}, minmax(0, 1fr))` }}
    >
      {dates.map((date) => {
        const key = format(date, 'yyyy-MM-dd');
        const list = eventsByDate[key] ?? [];
        const isToday = isSameDay(date, new Date());
        return (
          <div
            key={key}
            className={`border rounded p-2 bg-white flex flex-col gap-2 min-h-[200px] ${isToday ? 'border-primary-300 ring-1 ring-primary-200' : 'border-gray-200'}`}
          >
            <div className="flex items-center justify-between">
              <div className="text-xs">
                <div className="font-semibold text-gray-900">{format(date, 'EEEE', { locale: he })}</div>
                <div className="text-gray-500">{format(date, 'd בMMM', { locale: he })}</div>
              </div>
              <span className="text-[10px] text-gray-400">{list.length}</span>
            </div>

            <div className="flex-1 space-y-2">
              {list.map(({ event, idx }) => (
                <CompactEventCard
                  key={idx}
                  event={event}
                  idx={idx}
                  isCommitted={isCommitted}
                  compact={compact}
                  onUpdate={onUpdate}
                  onRemove={onRemove}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() => onAddEvent(date)}
              disabled={isCommitted}
              className="w-full py-1.5 border border-dashed border-gray-300 rounded text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50 inline-flex items-center justify-center gap-1"
            >
              <Plus className="w-3 h-3" /> אירוע
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────
// Monthly view — 6×7 grid; click a day to open daily view
// ─────────────────────────────────────────────

interface MonthlyViewProps {
  dates: Date[];
  viewDate: Date;
  eventsByDate: Record<string, { event: DraftEvent; idx: number }[]>;
  isCommitted: boolean;
  onAddEvent: (date: Date) => void;
  onSelectDay: (date: Date) => void;
}

function MonthlyView({ dates, viewDate, eventsByDate, onSelectDay, onAddEvent, isCommitted }: MonthlyViewProps) {
  const currentMonth = viewDate.getMonth();
  return (
    <div className="p-2">
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-gray-500 mb-1">
        {['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {dates.map((d) => {
          const key = format(d, 'yyyy-MM-dd');
          const list = eventsByDate[key] ?? [];
          const inMonth = d.getMonth() === currentMonth;
          const isToday = isSameDay(d, new Date());
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelectDay(d)}
              className={`min-h-[64px] text-right p-1 border rounded text-xs flex flex-col gap-0.5 ${
                inMonth ? 'bg-white' : 'bg-gray-50 text-gray-400'
              } ${isToday ? 'border-primary-300 ring-1 ring-primary-200' : 'border-gray-200'} hover:border-primary-400`}
            >
              <span className="font-semibold">{format(d, 'd')}</span>
              {list.slice(0, 2).map((it) => (
                <span key={it.idx} className="truncate text-[10px] text-gray-700">
                  {it.event.title || '(ללא כותרת)'}
                </span>
              ))}
              {list.length > 2 && <span className="text-[10px] text-gray-400">עוד {list.length - 2}</span>}
              {list.length === 0 && inMonth && !isCommitted && (
                <span
                  role="button"
                  onClick={(e) => { e.stopPropagation(); onAddEvent(d); }}
                  className="text-[10px] text-primary-600 hover:underline cursor-pointer"
                >
                  + הוסף
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Compact event card (used in column / orphan / monthly contexts)
// ─────────────────────────────────────────────

interface CardProps {
  event: DraftEvent;
  idx: number;
  isCommitted: boolean;
  compact?: boolean;
  showDate?: boolean;
  onUpdate: (idx: number, patch: Partial<DraftEvent>) => void;
  onRemove: (idx: number) => void;
}

function CompactEventCard({ event, idx, isCommitted, compact, showDate, onUpdate, onRemove }: CardProps) {
  const startTime = timeOf(event.start_time);
  const endTime = timeOf(event.end_time);
  const provider = event.provider ?? 'manual';

  return (
    <div className="border border-gray-200 rounded p-2 bg-white text-xs">
      <div className="flex items-start justify-between gap-1 mb-1">
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-medium text-gray-400">#{idx + 1}</span>
          <span className={`text-[10px] px-1 py-0.5 rounded border ${PROVIDER_BADGE_CLASS[provider]}`}>
            {PROVIDER_LABEL[provider]}
          </span>
          {event.source_page != null && (
            <span className="text-[10px] px-1 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200">
              ע' {event.source_page}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => onRemove(idx)}
          disabled={isCommitted}
          className="p-0.5 rounded text-red-500 hover:bg-red-50 disabled:opacity-30"
          aria-label="מחק"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      <input
        value={event.title}
        onChange={(e) => onUpdate(idx, { title: e.target.value })}
        placeholder="כותרת"
        disabled={isCommitted}
        className="w-full text-sm border border-gray-300 rounded px-1.5 py-0.5 mb-1"
        dir="rtl"
      />

      <div className={`grid ${compact ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-4'} gap-1 mb-1`}>
        <input
          type="time"
          value={startTime}
          onChange={(e) => onUpdate(idx, { start_time: setTimeOnIso(event.start_time, e.target.value) ?? '' })}
          disabled={isCommitted}
          className="text-xs border border-gray-300 rounded px-1 py-0.5"
          dir="ltr"
          aria-label="התחלה"
        />
        <input
          type="time"
          value={endTime}
          onChange={(e) => onUpdate(idx, { end_time: e.target.value ? setTimeOnIso(event.end_time ?? event.start_time, e.target.value) : null })}
          disabled={isCommitted}
          className="text-xs border border-gray-300 rounded px-1 py-0.5"
          dir="ltr"
          aria-label="סיום"
        />
        {showDate && (
          <input
            type="date"
            value={dateKeyOf(event.start_time)}
            onChange={(e) => onUpdate(idx, {
              start_time: e.target.value ? `${e.target.value}T${startTime || '00:00'}` : '',
            })}
            disabled={isCommitted}
            className="col-span-2 text-xs border border-gray-300 rounded px-1 py-0.5"
            dir="ltr"
            aria-label="תאריך"
          />
        )}
      </div>

      <input
        value={event.location ?? ''}
        onChange={(e) => onUpdate(idx, { location: e.target.value || null })}
        placeholder="מיקום"
        disabled={isCommitted}
        className="w-full text-xs border border-gray-300 rounded px-1.5 py-0.5 mb-1"
        dir="rtl"
      />
      <input
        value={event.participants ?? ''}
        onChange={(e) => onUpdate(idx, { participants: e.target.value || null })}
        placeholder="משתתפים"
        disabled={isCommitted}
        className="w-full text-xs border border-gray-300 rounded px-1.5 py-0.5"
        dir="rtl"
      />
    </div>
  );
}
