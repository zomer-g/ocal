import { useState } from 'react';
import { SearchBar } from '@/components/search/SearchBar';
import { FilterPanel } from '@/components/search/FilterPanel';
import { SearchResults } from '@/components/search/SearchResults';
import { Pagination } from '@/components/shared/Pagination';
import { useFilterStore } from '@/stores/filterStore';
import { useEvents } from '@/hooks/useEvents';
import { Loader2, SlidersHorizontal, X } from 'lucide-react';

export function SearchPage() {
  const filters = useFilterStore();
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const { data, isLoading, isError } = useEvents({
    q: filters.q || undefined,
    from_date: filters.from_date || undefined,
    to_date: filters.to_date || undefined,
    source_ids: filters.source_ids.length ? filters.source_ids.join(',') : undefined,
    location: filters.location || undefined,
    participants: filters.participants || undefined,
    sort: filters.q ? 'relevance' : filters.sort,
    page: filters.page,
    per_page: 50,
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
      <div className="mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1 sm:mb-2">חיפוש אירועים</h1>
        <p className="text-xs sm:text-sm text-gray-500">חיפוש ביומני נבחרי ציבור וגורמים ממשלתיים</p>
      </div>

      <SearchBar value={filters.q} onChange={filters.setQuery} />

      {/* Mobile filter toggle */}
      <button
        onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
        className="lg:hidden mt-3 flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 px-3 py-2 border border-gray-300 rounded-lg"
      >
        <SlidersHorizontal className="w-4 h-4" />
        סינון
        {(filters.from_date || filters.to_date || filters.source_ids.length > 0 || filters.location || filters.participants) && (
          <span className="w-2 h-2 rounded-full bg-primary-500" />
        )}
      </button>

      {/* Mobile filters drawer */}
      {mobileFiltersOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/30" onClick={() => setMobileFiltersOpen(false)} />
          {/* Drawer */}
          <div className="relative w-80 max-w-[85vw] bg-gray-50 mr-auto shadow-xl overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
              <h3 className="text-sm font-semibold text-gray-700">סינון</h3>
              <button onClick={() => setMobileFiltersOpen(false)} className="p-1 rounded hover:bg-gray-100">
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
        <aside className="w-64 shrink-0 hidden lg:block">
          <FilterPanel />
        </aside>

        {/* Results */}
        <div className="flex-1 min-w-0">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
              <span className="mr-2 text-gray-500">טוען...</span>
            </div>
          )}

          {isError && (
            <div className="text-center py-12 text-red-500">
              שגיאה בטעינת הנתונים. נסו שוב.
            </div>
          )}

          {data && (
            <>
              <SearchResults events={data.data} total={data.pagination.total} />
              <Pagination pagination={data.pagination} onPageChange={filters.setPage} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
