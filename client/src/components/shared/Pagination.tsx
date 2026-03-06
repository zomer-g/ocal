import { ChevronRight, ChevronLeft } from 'lucide-react';
import type { PaginationMeta } from '@/api/events';

interface PaginationProps {
  pagination: PaginationMeta;
  onPageChange: (page: number) => void;
}

export function Pagination({ pagination, onPageChange }: PaginationProps) {
  const { page, total_pages } = pagination;
  if (total_pages <= 1) return null;

  return (
    <nav role="navigation" aria-label="ניווט עמודים" className="flex items-center justify-center gap-2 mt-6">
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= total_pages}
        className="p-2 rounded-lg border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
        aria-label="עמוד הבא"
        aria-disabled={page >= total_pages || undefined}
      >
        <ChevronRight className="w-4 h-4" />
      </button>

      <span className="text-sm text-gray-600 px-3">
        עמוד {page} מתוך {total_pages}
      </span>

      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="p-2 rounded-lg border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
        aria-label="עמוד קודם"
        aria-disabled={page <= 1 || undefined}
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
    </nav>
  );
}
