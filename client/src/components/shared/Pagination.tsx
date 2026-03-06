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
    <div className="flex items-center justify-center gap-2 mt-6">
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= total_pages}
        className="p-2 rounded-lg border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
        aria-label="עמוד הבא"
      >
        <ChevronRight className="w-4 h-4" />
      </button>

      <span className="text-sm text-gray-600 px-3">
        עמוד {page} מתוך {total_pages}
      </span>

      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="p-2 rounded-lg border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
        aria-label="עמוד קודם"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
    </div>
  );
}
