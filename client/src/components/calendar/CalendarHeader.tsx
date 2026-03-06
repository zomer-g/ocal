import { useCalendarStore, type CalendarView } from '@/stores/calendarStore';
import {
  formatMonthYear,
  formatWeekRange,
  format4DayRange,
  formatHebrewDate,
} from '@/lib/formatters';
import { ChevronRight, ChevronLeft } from 'lucide-react';

const VIEW_OPTIONS: { value: CalendarView; label: string; mobileLabel: string }[] = [
  { value: 'day', label: 'יום', mobileLabel: 'יום' },
  { value: '4day', label: '4 ימים', mobileLabel: '4י' },
  { value: 'week', label: 'שבוע', mobileLabel: 'שבוע' },
  { value: 'month', label: 'חודש', mobileLabel: 'חודש' },
];

export function CalendarHeader() {
  const { date, view, setView, goToday, navigate } = useCalendarStore();

  const dateLabel = (() => {
    switch (view) {
      case 'month':
        return formatMonthYear(date);
      case 'week':
        return formatWeekRange(date);
      case '4day':
        return format4DayRange(date);
      case 'day':
        return formatHebrewDate(date);
    }
  })();

  return (
    <div className="flex items-center justify-between mb-3 sm:mb-4 flex-wrap gap-2" role="toolbar" aria-label="בקרת לוח שנה">
      {/* Left side: navigation */}
      <div className="flex items-center gap-1 sm:gap-2">
        {/* Today button */}
        <button
          onClick={goToday}
          className="px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm border border-primary-200 rounded-lg hover:bg-primary-50 transition-colors font-medium text-primary-700"
        >
          היום
        </button>

        {/* Navigation arrows */}
        <div className="flex items-center">
          <button
            onClick={() => navigate(1)}
            className="p-1 sm:p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="תקופה הבאה"
          >
            <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
          </button>
          <button
            onClick={() => navigate(-1)}
            className="p-1 sm:p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="תקופה קודמת"
          >
            <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
          </button>
        </div>

        {/* Date label */}
        <h1 className="text-sm sm:text-lg font-bold text-gray-900 min-w-0 truncate">
          {dateLabel}
        </h1>
      </div>

      {/* Right side: view selector */}
      <div className="flex border border-gray-300 rounded-lg overflow-hidden" role="group" aria-label="תצוגת לוח שנה">
        {VIEW_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setView(opt.value)}
            aria-pressed={view === opt.value}
            className={`px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium transition-colors ${
              view === opt.value
                ? 'bg-primary-700 text-white'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <span className="hidden sm:inline">{opt.label}</span>
            <span className="sm:hidden">{opt.mobileLabel}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
