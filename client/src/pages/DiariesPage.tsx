import { useState, useMemo, useEffect, useRef } from 'react';
import { BookOpen, Download, Loader2, LayoutGrid, Table2, Code2, CheckSquare, X, AlertCircle } from 'lucide-react';
import { useSources } from '@/hooks/useSources';
import { bulkDownload } from '@/api/download';
import { DiaryCard } from '@/components/diaries/DiaryCard';
import { DiaryTable } from '@/components/diaries/DiaryTable';
import { ApiDocsSection } from '@/components/diaries/ApiDocsSection';

type Tab = 'cards' | 'table' | 'api';

const TABS: { key: Tab; label: string; icon: typeof LayoutGrid }[] = [
  { key: 'cards', label: 'כרטיסיות', icon: LayoutGrid },
  { key: 'table', label: 'טבלה', icon: Table2 },
  { key: 'api', label: 'API', icon: Code2 },
];

export function DiariesPage() {
  const { data, isLoading, isError } = useSources();
  const sources = data?.data ?? [];
  const [activeTab, setActiveTab] = useState<Tab>('cards');

  // Selection mode + selected source IDs (persisted across tab switches)
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [downloadingFormat, setDownloadingFormat] = useState<'csv' | 'json' | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Focus management: remember the trigger so we can restore focus on exit
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const firstActionRef = useRef<HTMLButtonElement | null>(null);

  const sourceIds = useMemo(() => sources.map((s) => s.id), [sources]);
  const allSelected = selectedIds.size > 0 && selectedIds.size === sourceIds.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < sourceIds.length;

  function enterSelectionMode() {
    setSelectionMode(true);
    setSelectedIds(new Set());
    setDownloadError(null);
  }

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setDownloadError(null);
    // Return focus to the trigger button on the next paint
    setTimeout(() => triggerRef.current?.focus(), 0);
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sourceIds));
    }
  }

  async function handleBulkDownload(format: 'csv' | 'json') {
    if (selectedIds.size === 0 || downloadingFormat) return;
    setDownloadError(null);
    setDownloadingFormat(format);
    try {
      await bulkDownload({
        source_ids: Array.from(selectedIds),
        format,
      });
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'שגיאה בהורדה');
    } finally {
      setDownloadingFormat(null);
    }
  }

  // Escape exits selection mode (when not downloading)
  useEffect(() => {
    if (!selectionMode) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && downloadingFormat === null) {
        exitSelectionMode();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectionMode, downloadingFormat]);

  // Move focus into the action bar when entering selection mode so keyboard
  // users land on a useful control instead of being stranded on the (now
  // hidden) trigger button.
  useEffect(() => {
    if (selectionMode) {
      setTimeout(() => firstActionRef.current?.focus(), 50);
    }
  }, [selectionMode]);

  return (
    <div>
      {/* ── Hero ── */}
      <section className="bg-gradient-to-b from-primary-800 to-primary-700 text-white py-10 sm:py-14 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2">יומנים</h1>
          <p className="text-primary-100 text-sm sm:text-base mb-8">
            כל יומני הנבחרים הפתוחים — לצפייה, הורדה ועיבוד נתונים
          </p>

          {/* Bulk-download trigger (replaces the old "Download all" buttons) */}
          {!selectionMode && (
            <div className="flex items-center justify-center">
              <button
                ref={triggerRef}
                onClick={enterSelectionMode}
                disabled={sources.length === 0}
                aria-expanded={selectionMode}
                aria-controls="bulk-action-bar"
                className="flex items-center gap-2 px-5 py-2.5 bg-white text-primary-800 font-semibold rounded-lg hover:bg-primary-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary-700 transition-colors shadow disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckSquare className="w-4 h-4" aria-hidden="true" />
                הורדה מרובה
              </button>
            </div>
          )}

          {/* Selection-mode helper text */}
          {selectionMode && (
            <p className="text-primary-100 text-sm">
              סמן את היומנים שברצונך להוריד, או לחץ "בחר הכל"
            </p>
          )}
        </div>
      </section>

      {/* ── Content ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-32">
        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-20" role="status" aria-live="polite">
            <Loader2 className="w-6 h-6 animate-spin text-primary-600" aria-hidden="true" />
            <span className="mr-2 text-gray-600">טוען יומנים...</span>
          </div>
        )}

        {/* Error */}
        {isError && (
          <div className="text-center py-20 text-red-700" role="alert">
            שגיאה בטעינת היומנים. נסו שוב.
          </div>
        )}

        {/* Empty */}
        {!isLoading && !isError && sources.length === 0 && (
          <div className="text-center py-20 text-gray-500">
            <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-40" aria-hidden="true" />
            <p>אין יומנים זמינים כרגע.</p>
          </div>
        )}

        {/* Tabs + content */}
        {sources.length > 0 && (
          <>
            {/* Tab bar */}
            <div className="flex items-center justify-between mb-6">
              <p className="text-sm text-gray-600">{sources.length} יומנים פעילים</p>
              <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg" role="tablist" aria-label="תצוגת יומנים">
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 transition-colors ${
                        isActive
                          ? 'bg-white text-primary-700 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                      aria-selected={isActive}
                      role="tab"
                    >
                      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tab content */}
            {activeTab === 'cards' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {sources.map((source) => (
                  <DiaryCard
                    key={source.id}
                    source={source}
                    selectionMode={selectionMode}
                    selected={selectedIds.has(source.id)}
                    onToggleSelect={() => toggleOne(source.id)}
                  />
                ))}
              </div>
            )}

            {activeTab === 'table' && (
              <DiaryTable
                sources={sources}
                selectionMode={selectionMode}
                selectedIds={selectedIds}
                onToggleSelect={toggleOne}
              />
            )}

            {activeTab === 'api' && (
              <ApiDocsSection alwaysOpen />
            )}
          </>
        )}
      </div>

      {/* ── Sticky bulk-download action bar ── */}
      {selectionMode && (
        <div
          id="bulk-action-bar"
          role="region"
          aria-label="פעולות הורדה מרובה"
          className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-gray-200 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
            {downloadError && (
              <div className="flex items-center gap-2 mb-2 text-sm text-red-700" role="alert">
                <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{downloadError}</span>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 flex-wrap">
              {/* Left: selection count + select-all */}
              <div className="flex items-center gap-3 text-sm">
                <span className="font-medium text-gray-900" aria-live="polite" aria-atomic="true">
                  {selectedIds.size === 0
                    ? 'לא נבחרו יומנים'
                    : `${selectedIds.size.toLocaleString('he-IL')} מתוך ${sources.length.toLocaleString('he-IL')} נבחרו`}
                </span>
                <button
                  ref={firstActionRef}
                  onClick={toggleAll}
                  aria-pressed={allSelected}
                  className="text-primary-700 hover:text-primary-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded font-medium underline-offset-2 hover:underline"
                >
                  {allSelected ? 'בטל בחירה של הכל' : 'בחר הכל'}
                </button>
                {someSelected && (
                  <span className="text-xs text-gray-600">({sources.length - selectedIds.size} לא נבחרו)</span>
                )}
              </div>

              {/* Right: actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleBulkDownload('csv')}
                  disabled={selectedIds.size === 0 || downloadingFormat !== null}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary-700 text-white font-medium rounded-lg hover:bg-primary-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="הורד ZIP עם קובץ CSV אחד לכל יומן"
                  aria-busy={downloadingFormat === 'csv'}
                >
                  {downloadingFormat === 'csv'
                    ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    : <Download className="w-4 h-4" aria-hidden="true" />}
                  הורד ZIP (CSV)
                </button>
                <button
                  onClick={() => handleBulkDownload('json')}
                  disabled={selectedIds.size === 0 || downloadingFormat !== null}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm bg-gray-700 text-white font-medium rounded-lg hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="הורד ZIP עם קובץ JSON אחד לכל יומן"
                  aria-busy={downloadingFormat === 'json'}
                >
                  {downloadingFormat === 'json'
                    ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    : <Download className="w-4 h-4" aria-hidden="true" />}
                  הורד ZIP (JSON)
                </button>
                <button
                  onClick={exitSelectionMode}
                  disabled={downloadingFormat !== null}
                  className="flex items-center gap-1 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded-lg transition-colors disabled:opacity-50"
                  aria-label="יציאה ממצב בחירה מרובה (Escape)"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                  יציאה
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
