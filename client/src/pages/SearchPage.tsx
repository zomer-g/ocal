import { useState } from 'react';
import { SearchBar } from '@/components/search/SearchBar';
import { AdvancedSearchBuilder } from '@/components/search/AdvancedSearchBuilder';
import { FilterPanel } from '@/components/search/FilterPanel';
import { SearchResults } from '@/components/search/SearchResults';
import { Pagination } from '@/components/shared/Pagination';
import { useFilterStore } from '@/stores/filterStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useEvents } from '@/hooks/useEvents';
import { useStats } from '@/hooks/useStats';
import { Loader2, SlidersHorizontal, X, ArrowUpDown } from 'lucide-react';

export function SearchPage() {
  const filters = useFilterStore();
  const { hideFutureEvents } = useSettingsStore();
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const { data: stats } = useStats();

  const today = new Date().toISOString().split('T')[0];
  const effectiveTo = hideFutureEvents
    ? (!filters.to_date || filters.to_date > today ? today : filters.to_date)
    : filters.to_date || undefined;

  // Build the combined query string for boolean search
  const combinedQ =
    filters.advancedMode && filters.extraConditions.length > 0
      ? [
          filters.q,
          ...filters.extraConditions
            .filter((c) => c.term.trim())
            .map((c) => `${c.operator} ${c.term.trim()}`),
        ]
          .filter(Boolean)
          .join(' ')
      : filters.q || undefined;

  const { data, isLoading, isError } = useEvents({
    q: combinedQ,
    from_date: filters.from_date || undefined,
    to_date: effectiveTo,
    source_ids: filters.source_ids.length ? filters.source_ids.join(',') : undefined,
    entity_names: filters.entity_names.length ? filters.entity_names.join('||') : undefined,
    location: filters.location || undefined,
    participants: filters.participants || undefined,
    sort: filters.sort,
    page: filters.page,
    per_page: 50,
  });

  return (
    <div>
      {/* ── Hero Section ── */}
      <section className="bg-gradient-to-b from-primary-800 to-primary-700 text-white py-10 sm:py-14 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2">
            יומן לעם
          </h1>
          <p className="text-primary-100 text-sm sm:text-base mb-6">
            חיפוש ביומני נבחרי ציבור וגורמים ממשלתיים
          </p>
        </div>
        <div className="max-w-3xl mx-auto px-4">
          {filters.advancedMode ? (
            <AdvancedSearchBuilder />
          ) : (
            <div className="flex flex-col items-center gap-2 w-full">
              <SearchBar value={filters.q} onChange={filters.setQuery} variant="hero" />
              <button
                type="button"
                onClick={() => filters.setAdvancedMode(true)}
                className="text-xs text-primary-200 hover:text-white transition-colors underline-offset-2 hover:underline"
              >
                חיפוש מתקדם ▾
              </button>
            </div>
          )}
        </div>

        {/* Stats row */}
        {stats && (stats.total_events > 0 || stats.total_sources > 0) && (
          <div className="flex items-center justify-center gap-6 sm:gap-10 mt-8" role="region" aria-label="סטטיסטיקות">
            <StatBadge value={stats.total_events} label="אירועים" />
            <StatBadge value={stats.total_sources} label="מקורות" />
            {stats.total_organizations > 0 && (
              <StatBadge value={stats.total_organizations} label="ארגונים" />
            )}
          </div>
        )}
      </section>

      {/* ── Main Content ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        {/* Mobile filter toggle */}
        <button
          onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
          className="lg:hidden mb-3 flex items-center gap-2 text-sm text-primary-700 hover:text-primary-800 px-3 py-2 border border-primary-200 rounded-lg"
          aria-expanded={mobileFiltersOpen}
          aria-label="פתח סינון"
        >
          <SlidersHorizontal className="w-4 h-4" />
          סינון
          {(filters.from_date || filters.to_date || filters.source_ids.length > 0 || filters.location || filters.participants || filters.entity_names.length > 0) && (
            <span className="w-2 h-2 rounded-full bg-primary-600" />
          )}
        </button>

        {/* Mobile filters drawer */}
        {mobileFiltersOpen && (
          <div className="lg:hidden fixed inset-0 z-40 flex" role="dialog" aria-modal="true" aria-label="סינון">
            <div className="fixed inset-0 bg-black/30" aria-hidden="true" onClick={() => setMobileFiltersOpen(false)} />
            <div className="relative w-80 max-w-[85vw] bg-gray-50 mr-auto shadow-xl overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
                <h3 className="text-sm font-semibold text-gray-700">סינון</h3>
                <button
                  onClick={() => setMobileFiltersOpen(false)}
                  className="p-1 rounded hover:bg-gray-100"
                  aria-label="סגור סינון"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="p-4">
                <FilterPanel />
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 sm:mt-6 flex gap-6">
          {/* Desktop sidebar filters */}
          <aside className="w-64 shrink-0 hidden lg:block sticky top-4 self-start max-h-[calc(100vh-6rem)] overflow-y-auto">
            <FilterPanel />
          </aside>

          {/* Results */}
          <div className="flex-1 min-w-0">
            {isLoading && (
              <div className="flex items-center justify-center py-12" role="status" aria-live="polite">
                <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
                <span className="mr-2 text-gray-500">טוען...</span>
              </div>
            )}

            {isError && (
              <div className="text-center py-12 text-red-600" role="alert">
                שגיאה בטעינת הנתונים. נסו שוב.
              </div>
            )}

            {data && (
              <>
                {/* Sort toggle — show when search query is active */}
                {data.pagination.total > 0 && (
                  <div className="flex items-center justify-between mb-1">
                    <div />
                    <div className="flex items-center gap-1">
                      <ArrowUpDown className="w-3.5 h-3.5 text-gray-400" />
                      {(['relevance', 'date_desc', 'date_asc'] as const)
                        .filter((s) => s === 'relevance' ? !!combinedQ : true)
                        .map((s) => (
                        <button
                          key={s}
                          onClick={() => filters.setSort(s)}
                          className={`text-xs px-2 py-1 rounded transition-colors ${
                            filters.sort === s
                              ? 'bg-primary-100 text-primary-700 font-medium'
                              : 'text-gray-500 hover:bg-gray-100'
                          }`}
                        >
                          {s === 'relevance' ? 'רלוונטיות' : s === 'date_desc' ? 'חדש → ישן' : 'ישן → חדש'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <SearchResults events={data.data} total={data.pagination.total} />
                <Pagination pagination={data.pagination} onPageChange={filters.setPage} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatBadge({ value, label }: { value: number; label: string }) {
  return (
    <div className="text-center">
      <div className="text-2xl sm:text-3xl font-bold text-white">
        {value.toLocaleString('he-IL')}
      </div>
      <div className="text-xs sm:text-sm text-primary-200">{label}</div>
    </div>
  );
}
