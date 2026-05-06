import { useState, useEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Save, Sparkles, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import {
  saveDraftEvents,
  extractFromPdf,
  commitManualUpload,
  type DraftEvent,
  type LLMProvider,
  type ManualUpload,
} from '@/api/manualUploads';
import { getAdminSources } from '@/api/admin';
import { getPeople } from '@/api/admin';

interface Props {
  upload: ManualUpload;
  currentPdfPage: number;
  onCommitted: (sourceId: string) => void;
}

const PROVIDER_LABEL: Record<NonNullable<DraftEvent['provider']>, string> = {
  manual: 'הוזן ידנית',
  claude: 'Claude',
  gpt4o: 'GPT-4o',
};

const PROVIDER_BADGE_CLASS: Record<NonNullable<DraftEvent['provider']>, string> = {
  manual: 'bg-gray-100 text-gray-700 border-gray-300',
  claude: 'bg-violet-100 text-violet-800 border-violet-300',
  gpt4o: 'bg-emerald-100 text-emerald-800 border-emerald-300',
};

function emptyEvent(page: number): DraftEvent {
  return {
    title: '',
    start_time: new Date().toISOString().slice(0, 16),
    end_time: null,
    location: null,
    participants: null,
    notes: null,
    source_page: page > 0 ? page : null,
    provider: 'manual',
  };
}

export function ManualEventEditor({ upload, currentPdfPage, onCommitted }: Props) {
  const queryClient = useQueryClient();
  const [events, setEvents] = useState<DraftEvent[]>(upload.draft_events ?? []);
  const [selectedProvider, setSelectedProvider] = useState<LLMProvider>('claude');
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

  // Hydrate when the upload changes (e.g., after page navigation back to it)
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

  // Autosave: debounce by 800ms after the last edit
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
      // Append (don't replace) so admin work isn't clobbered
      setEvents((prev) => [
        ...prev,
        ...resp.events.map((e) => ({ ...e, provider: resp.provider })),
      ]);
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

  const updateEvent = (idx: number, patch: Partial<DraftEvent>) => {
    setEvents((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  };
  const removeEvent = (idx: number) => setEvents((prev) => prev.filter((_, i) => i !== idx));
  const addEvent = () => setEvents((prev) => [...prev, emptyEvent(currentPdfPage)]);

  const claudeCount = useMemo(() => events.filter((e) => e.provider === 'claude').length, [events]);
  const gpt4oCount = useMemo(() => events.filter((e) => e.provider === 'gpt4o').length, [events]);
  const manualCount = useMemo(() => events.filter((e) => !e.provider || e.provider === 'manual').length, [events]);

  const isCommitted = !!upload.committed_at;

  return (
    <div className="flex flex-col h-full bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 p-3 bg-gray-50 border-b border-gray-200 shrink-0">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-700">חילוץ אוטומטי:</span>
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
              {extractMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {extractMutation.isPending ? 'מחלץ...' : 'מלא אוטומטית'}
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs text-gray-500">
            {saveStatus === 'saving' && <span className="inline-flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />שומר...</span>}
            {saveStatus === 'saved' && <span className="inline-flex items-center gap-1 text-green-600"><CheckCircle2 className="w-3 h-3" />נשמר</span>}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <span className="text-gray-600">סה"כ {events.length} אירועים:</span>
          {manualCount > 0 && <span className={`px-1.5 py-0.5 rounded border ${PROVIDER_BADGE_CLASS.manual}`}>ידני: {manualCount}</span>}
          {claudeCount > 0 && <span className={`px-1.5 py-0.5 rounded border ${PROVIDER_BADGE_CLASS.claude}`}>Claude: {claudeCount}</span>}
          {gpt4oCount > 0 && <span className={`px-1.5 py-0.5 rounded border ${PROVIDER_BADGE_CLASS.gpt4o}`}>GPT-4o: {gpt4oCount}</span>}
        </div>
      </div>

      {/* Event list */}
      <div className="flex-1 overflow-auto p-3 space-y-3">
        {events.length === 0 && (
          <div className="text-center text-gray-500 text-sm py-8">
            אין עדיין אירועים. לחץ "הוסף אירוע" או "מלא אוטומטית" כדי להתחיל.
          </div>
        )}

        {events.map((e, idx) => (
          <div key={idx} className="border border-gray-200 rounded-lg p-3 bg-white">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-400">#{idx + 1}</span>
                {e.provider && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${PROVIDER_BADGE_CLASS[e.provider]}`}>
                    {PROVIDER_LABEL[e.provider]}
                  </span>
                )}
                {e.source_page != null && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200">
                    עמוד {e.source_page}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeEvent(idx)}
                disabled={isCommitted}
                className="p-1 rounded text-red-500 hover:bg-red-50 disabled:opacity-30"
                aria-label="מחק אירוע"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input
                value={e.title}
                onChange={(ev) => updateEvent(idx, { title: ev.target.value })}
                placeholder="כותרת"
                disabled={isCommitted}
                className="md:col-span-2 text-sm border border-gray-300 rounded px-2 py-1"
                dir="rtl"
              />
              <input
                type="datetime-local"
                value={e.start_time?.slice(0, 16) ?? ''}
                onChange={(ev) => updateEvent(idx, { start_time: ev.target.value })}
                disabled={isCommitted}
                className="text-sm border border-gray-300 rounded px-2 py-1"
                dir="ltr"
                aria-label="זמן התחלה"
              />
              <input
                type="datetime-local"
                value={e.end_time?.slice(0, 16) ?? ''}
                onChange={(ev) => updateEvent(idx, { end_time: ev.target.value || null })}
                disabled={isCommitted}
                className="text-sm border border-gray-300 rounded px-2 py-1"
                dir="ltr"
                aria-label="זמן סיום"
                placeholder="סיום (אופציונלי)"
              />
              <input
                value={e.location ?? ''}
                onChange={(ev) => updateEvent(idx, { location: ev.target.value || null })}
                placeholder="מיקום"
                disabled={isCommitted}
                className="text-sm border border-gray-300 rounded px-2 py-1"
                dir="rtl"
              />
              <input
                value={e.participants ?? ''}
                onChange={(ev) => updateEvent(idx, { participants: ev.target.value || null })}
                placeholder="משתתפים"
                disabled={isCommitted}
                className="text-sm border border-gray-300 rounded px-2 py-1"
                dir="rtl"
              />
              <input
                type="number"
                value={e.source_page ?? ''}
                onChange={(ev) =>
                  updateEvent(idx, {
                    source_page: ev.target.value ? Number(ev.target.value) : null,
                  })
                }
                placeholder="עמוד ב-PDF"
                disabled={isCommitted}
                className="md:col-span-2 text-sm border border-gray-300 rounded px-2 py-1"
                dir="ltr"
              />
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={addEvent}
          disabled={isCommitted}
          className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> הוסף אירוע
        </button>
      </div>

      {/* Bottom commit panel */}
      {!isCommitted && (
        <div className="border-t border-gray-200 bg-gray-50 p-3 space-y-3 shrink-0">
          <div className="flex items-center gap-3 text-sm">
            <label className="inline-flex items-center gap-1">
              <input
                type="radio"
                checked={sourceMode === 'new'}
                onChange={() => setSourceMode('new')}
              />
              צור מקור חדש
            </label>
            <label className="inline-flex items-center gap-1">
              <input
                type="radio"
                checked={sourceMode === 'existing'}
                onChange={() => setSourceMode('existing')}
              />
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
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
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
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
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
