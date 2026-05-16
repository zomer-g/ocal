import { Code2 } from 'lucide-react';
import { ApiDocsSection } from '@/components/diaries/ApiDocsSection';

export function ApiPage() {
  return (
    <div>
      {/* ── Hero ── */}
      <section className="bg-gradient-to-b from-primary-800 to-primary-700 text-white py-10 sm:py-14 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Code2 className="w-7 h-7 sm:w-8 sm:h-8 text-primary-200" aria-hidden="true" />
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold">API ציבורי</h1>
          </div>
          <p className="text-primary-100 text-sm sm:text-base">
            כל נקודות הקצה פתוחות לציבור, ללא צורך באימות — לקריאה, סינון והורדה של נתונים
          </p>
        </div>
      </section>

      {/* ── Content ── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <ApiDocsSection alwaysOpen />
      </div>
    </div>
  );
}
