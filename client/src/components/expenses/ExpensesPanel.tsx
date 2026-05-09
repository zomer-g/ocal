import { useQuery } from '@tanstack/react-query';
import { Receipt, Loader2 } from 'lucide-react';
import { searchExpenses, type ExpenseSearchParams } from '@/api/expenses';
import { ExpenseCard } from './ExpenseCard';

interface Props {
  params: ExpenseSearchParams;
  /** Heading shown above the list. */
  title?: string;
}

const EXPENSE_ACCENT = '#F59E0B';

/**
 * Standalone list of MK expenses for a date range / filter, used as the
 * overlay layer on the Calendar page. SearchPage instead interleaves
 * expenses inside SearchResults grouped by date — see SearchResults.tsx.
 */
export function ExpensesPanel({ params, title }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['public-expenses', params],
    queryFn: () => searchExpenses({ ...params, per_page: params.per_page ?? 50 }),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-400 text-sm">
        <Loader2 className="w-4 h-4 animate-spin ml-2" /> טוען הוצאות...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">
        שגיאה בטעינת הוצאות
      </div>
    );
  }

  const expenses = data?.data ?? [];
  if (expenses.length === 0) {
    return (
      <div className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded p-4 text-center">
        אין הוצאות שמתאימות לסינון הנוכחי
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {title && (
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-gray-700 inline-flex items-center gap-1.5">
            <Receipt className="w-4 h-4" style={{ color: EXPENSE_ACCENT }} />
            {title}
          </h3>
          <span className="text-xs text-gray-500">
            {data!.pagination.total.toLocaleString('he-IL')} הוצאות
          </span>
        </div>
      )}
      <div className="space-y-1.5">
        {expenses.map((e) => (
          <ExpenseCard key={e.id} expense={e} />
        ))}
      </div>
      {data!.pagination.total > expenses.length && (
        <div className="text-xs text-gray-500 text-center pt-1">
          מוצגות {expenses.length} מתוך {data!.pagination.total.toLocaleString('he-IL')} הוצאות
        </div>
      )}
    </div>
  );
}
