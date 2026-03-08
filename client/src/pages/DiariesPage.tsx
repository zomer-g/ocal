import { BookOpen, Download, Loader2 } from 'lucide-react';
import { useSources } from '@/hooks/useSources';
import { getAllDownloadUrl, triggerDownload } from '@/api/download';
import { DiaryCard } from '@/components/diaries/DiaryCard';
import { ApiDocsSection } from '@/components/diaries/ApiDocsSection';

export function DiariesPage() {
  const { data, isLoading, isError } = useSources();
  const sources = data?.data ?? [];

  return (
    <div>
      {/* ── Hero ── */}
      <section className="bg-gradient-to-b from-primary-800 to-primary-700 text-white py-10 sm:py-14 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2">יומנים</h1>
          <p className="text-primary-100 text-sm sm:text-base mb-8">
            כל יומני הנבחרים הפתוחים — לצפייה, הורדה ועיבוד נתונים
          </p>

          {/* Download All buttons */}
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <button
              onClick={() => triggerDownload(getAllDownloadUrl('csv'))}
              className="flex items-center gap-2 px-5 py-2.5 bg-white text-primary-800 font-semibold rounded-lg hover:bg-primary-50 transition-colors shadow"
            >
              <Download className="w-4 h-4" />
              הורד הכל (CSV)
            </button>
            <button
              onClick={() => triggerDownload(getAllDownloadUrl('json'))}
              className="flex items-center gap-2 px-5 py-2.5 bg-white/15 text-white font-medium rounded-lg hover:bg-white/25 transition-colors border border-white/30"
            >
              <Download className="w-4 h-4" />
              הורד הכל (JSON)
            </button>
          </div>
        </div>
      </section>

      {/* ── Content ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-20" role="status" aria-live="polite">
            <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
            <span className="mr-2 text-gray-500">טוען יומנים...</span>
          </div>
        )}

        {/* Error */}
        {isError && (
          <div className="text-center py-20 text-red-600" role="alert">
            שגיאה בטעינת היומנים. נסו שוב.
          </div>
        )}

        {/* Empty */}
        {!isLoading && !isError && sources.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" aria-hidden="true" />
            <p>אין יומנים זמינים כרגע.</p>
          </div>
        )}

        {/* Source grid */}
        {sources.length > 0 && (
          <>
            <p className="text-sm text-gray-500 mb-6">
              {sources.length} יומנים פעילים
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {sources.map((source) => (
                <DiaryCard key={source.id} source={source} />
              ))}
            </div>

            {/* API docs */}
            <ApiDocsSection />
          </>
        )}
      </div>
    </div>
  );
}
