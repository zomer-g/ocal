import { useQuery } from '@tanstack/react-query';
import { Receipt, Loader2, ExternalLink } from 'lucide-react';
import { searchExpenses, type ExpenseSearchParams } from '@/api/expenses';

interface Props {
  params: ExpenseSearchParams;
  /** Heading shown above the list. */
  title?: string;
}

const EXPENSE_ACCENT = '#F59E0B'; // amber — visually distinct from any source color

/**
 * Small panel that renders a paginated/limited list of MK expenses.
 * Used as an overlay layer on SearchPage and CalendarPage when the
 * "שכבת הוצאות קשר עם הציבור" toggle is on.
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
        {expenses.map((e) => {
          const amountNum = typeof e.amount === 'string' ? Number(e.amount) : e.amount;
          const isRefund = amountNum < 0;
          return (
            <div
              key={e.id}
              className="bg-white rounded-lg border border-gray-200 hover:shadow-sm transition-shadow"
              role="article"
              aria-label={`הוצאה: ${e.category}`}
            >
              <div className="p-3 flex items-start gap-3">
                <div
                  className="w-1 self-stretch rounded-full shrink-0"
                  style={{ backgroundColor: EXPENSE_ACCENT }}
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <Receipt className="w-3.5 h-3.5 shrink-0" style={{ color: EXPENSE_ACCENT }} aria-hidden="true" />
                    <span className="text-xs font-bold uppercase tracking-wide" style={{ color: EXPENSE_ACCENT }}>
                      הוצאה
                    </span>
                    <span className="text-xs text-gray-400">·</span>
                    <span className="text-xs text-gray-600">
                      {new Date(e.expense_date + 'T12:00:00').toLocaleDateString('he-IL', {
                        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
                      })}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2 flex-wrap">
                    <h4 className="text-sm font-medium text-gray-900 truncate flex-1 min-w-0">
                      {e.category}
                      {e.vendor && <span className="text-gray-500 font-normal"> · {e.vendor}</span>}
                    </h4>
                    <span className={`text-sm font-bold tabular-nums shrink-0 ${isRefund ? 'text-green-700' : 'text-gray-900'}`}>
                      {amountNum.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₪
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-600">
                    <span className="font-medium">{e.person_name ?? e.mk_name_raw}</span>
                    {e.notes && <span className="text-gray-500 truncate"> · {e.notes}</span>}
                    {e.receipt_url && (
                      <a
                        href={e.receipt_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-600 hover:underline inline-flex items-center gap-0.5 shrink-0"
                      >
                        חשבונית <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {data!.pagination.total > expenses.length && (
        <div className="text-xs text-gray-500 text-center pt-1">
          מוצגות {expenses.length} מתוך {data!.pagination.total.toLocaleString('he-IL')} הוצאות
        </div>
      )}
    </div>
  );
}
