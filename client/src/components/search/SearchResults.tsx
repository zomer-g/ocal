import { useNavigate } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import type { DiaryEvent } from '@/api/events';
import type { MkExpense } from '@/api/expenses';
import { EventCard } from './EventCard';
import { ExpenseCard } from '@/components/expenses/ExpenseCard';
import { formatHebrewDate } from '@/lib/formatters';
import { useCalendarStore } from '@/stores/calendarStore';

interface SearchResultsProps {
  events: DiaryEvent[];
  total: number;
  /** Optional expense layer — when provided, expenses are interleaved with
   * events under the same date headers instead of rendered as a separate
   * section below the list. */
  expenses?: MkExpense[];
  expensesTotal?: number;
}

/**
 * Each row under a given date is either an event card or an expense card.
 * They share a date header so the user sees a true daily timeline.
 */
type Row =
  | { kind: 'event'; date: string; sortKey: string; event: DiaryEvent }
  | { kind: 'expense'; date: string; sortKey: string; expense: MkExpense };

export function SearchResults({ events, total, expenses, expensesTotal }: SearchResultsProps) {
  const navigate = useNavigate();
  const setDate = useCalendarStore((s) => s.setDate);

  const openDayInCalendar = (date: string) => {
    setDate(date);
    navigate('/calendar');
  };

  // Empty state — but only when both feeds are empty
  if (events.length === 0 && (!expenses || expenses.length === 0)) {
    return (
      <div className="text-center py-12 text-gray-500" role="status">
        <p className="text-lg">לא נמצאו תוצאות</p>
        <p className="text-sm mt-1">נסו לשנות את מילות החיפוש או המסננים</p>
      </div>
    );
  }

  // Build a single per-date bucket. Events keep their existing sort
  // (the API order — date_desc by default); expenses always sort to the
  // bottom of their own day so they cluster (a "spent on this day" block).
  const grouped = new Map<string, Row[]>();

  for (const event of events) {
    const date = event.event_date;
    const row: Row = {
      kind: 'event',
      date,
      sortKey: `0_${event.start_time ?? ''}`, // events first within a day
      event,
    };
    (grouped.get(date) ?? grouped.set(date, []).get(date)!).push(row);
  }

  for (const expense of expenses ?? []) {
    const date = expense.expense_date;
    const row: Row = {
      kind: 'expense',
      date,
      sortKey: `1_${expense.id}`, // expenses after events on the same day
      expense,
    };
    (grouped.get(date) ?? grouped.set(date, []).get(date)!).push(row);
  }

  // Sort each day's rows so events come first, then expenses
  for (const arr of grouped.values()) {
    arr.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }

  // Sort the dates in the same order as the underlying event ordering —
  // i.e. preserve descending or ascending as the API returned. We can't
  // know the API sort here, so use the order in which dates first appeared
  // in `events` (with any expense-only dates appended in their natural
  // descending order).
  const dateOrder: string[] = [];
  const seen = new Set<string>();
  for (const e of events) {
    if (!seen.has(e.event_date)) {
      seen.add(e.event_date);
      dateOrder.push(e.event_date);
    }
  }
  // Append any expense-only dates, sorted desc by default
  const extra = (expenses ?? [])
    .map((x) => x.expense_date)
    .filter((d) => !seen.has(d));
  for (const d of [...new Set(extra)].sort((a, b) => b.localeCompare(a))) {
    dateOrder.push(d);
  }

  const totalLabel =
    expensesTotal != null
      ? `${total.toLocaleString('he-IL')} אירועים · ${expensesTotal.toLocaleString('he-IL')} הוצאות`
      : `${total.toLocaleString('he-IL')} תוצאות`;

  return (
    <div role="region" aria-label="תוצאות חיפוש" aria-live="polite">
      <p className="text-sm text-gray-500 mb-4">נמצאו {totalLabel}</p>

      <div className="space-y-6">
        {dateOrder.map((date) => {
          const rows = grouped.get(date) ?? [];
          return (
            <div key={date}>
              <div className="flex items-center justify-between mb-2 sticky top-16 bg-gray-50 py-1 z-10">
                <h2 className="text-sm font-semibold text-gray-700">
                  {formatHebrewDate(date)}
                </h2>
                <button
                  onClick={() => openDayInCalendar(date)}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-primary-600 transition-colors px-1.5 py-0.5 rounded hover:bg-primary-50"
                  title="פתח יום זה ביומן"
                >
                  <CalendarDays className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">פתח ביומן</span>
                </button>
              </div>
              <div className="space-y-2">
                {rows.map((r) =>
                  r.kind === 'event' ? (
                    <EventCard key={r.event.id} event={r.event} />
                  ) : (
                    <ExpenseCard key={r.expense.id} expense={r.expense} hideDate />
                  ),
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
