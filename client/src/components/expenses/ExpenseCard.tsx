import { Receipt, ExternalLink } from 'lucide-react';
import type { MkExpense } from '@/api/expenses';

const EXPENSE_ACCENT = '#F59E0B'; // amber — visually distinct from any source color

interface Props {
  expense: MkExpense;
  /** When the card is rendered grouped under its date (e.g. interleaved with
   * events on SearchResults), the date line is redundant — hide it. */
  hideDate?: boolean;
}

/**
 * Single MK expense rendered as a card matching the EventCard footprint.
 * Amber accent + Receipt icon to make the row obviously distinct from
 * diary events on a mixed-date timeline.
 */
export function ExpenseCard({ expense: e, hideDate = false }: Props) {
  const amountNum = typeof e.amount === 'string' ? Number(e.amount) : e.amount;
  const isRefund = amountNum < 0;
  return (
    <div
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
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <Receipt className="w-3.5 h-3.5 shrink-0" style={{ color: EXPENSE_ACCENT }} aria-hidden="true" />
            <span className="text-xs font-bold uppercase tracking-wide" style={{ color: EXPENSE_ACCENT }}>
              הוצאה
            </span>
            {!hideDate && (
              <>
                <span className="text-xs text-gray-400">·</span>
                <span className="text-xs text-gray-600">
                  {new Date(e.expense_date + 'T12:00:00').toLocaleDateString('he-IL', {
                    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
                  })}
                </span>
              </>
            )}
          </div>
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <h4 className="text-sm font-medium text-gray-900 truncate flex-1 min-w-0">
              {e.category}
              {e.vendor && <span className="text-gray-500 font-normal"> · {e.vendor}</span>}
            </h4>
            <span
              className={`text-sm font-bold tabular-nums shrink-0 ${isRefund ? 'text-green-700' : 'text-gray-900'}`}
            >
              {amountNum.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₪
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-600 flex-wrap">
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
}
