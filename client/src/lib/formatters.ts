const hebrewDays = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const hebrewDaysShort = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const hebrewMonths = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

export function formatHebrewDate(dateStr: string): string {
  const date = new Date(dateStr);
  const day = hebrewDays[date.getDay()];
  const dayNum = date.getDate();
  const month = hebrewMonths[date.getMonth()];
  const year = date.getFullYear();
  return `יום ${day}, ${dayNum} ${month} ${year}`;
}

export function formatHebrewDateShort(dateStr: string): string {
  const date = new Date(dateStr);
  const dayNum = date.getDate();
  const month = hebrewMonths[date.getMonth()];
  return `${dayNum} ${month}`;
}

export function formatDayHeader(dateStr: string): string {
  const date = new Date(dateStr);
  const dayName = hebrewDays[date.getDay()];
  const dayNum = date.getDate();
  return `${dayName} ${dayNum}`;
}

export function formatDayHeaderShort(dateStr: string): string {
  const date = new Date(dateStr);
  const dayName = hebrewDaysShort[date.getDay()];
  const dayNum = date.getDate();
  return `${dayName} ${dayNum}`;
}

export function formatMonthYear(dateStr: string): string {
  const date = new Date(dateStr);
  return `${hebrewMonths[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatWeekRange(dateStr: string): string {
  const date = new Date(dateStr);
  const sunday = new Date(date);
  sunday.setDate(sunday.getDate() - sunday.getDay());
  const saturday = new Date(sunday);
  saturday.setDate(saturday.getDate() + 6);

  const startMonth = hebrewMonths[sunday.getMonth()];
  const endMonth = hebrewMonths[saturday.getMonth()];
  const year = saturday.getFullYear();

  if (sunday.getMonth() === saturday.getMonth()) {
    return `${sunday.getDate()}-${saturday.getDate()} ${startMonth} ${year}`;
  }
  return `${sunday.getDate()} ${startMonth} - ${saturday.getDate()} ${endMonth} ${year}`;
}

export function format4DayRange(dateStr: string): string {
  const start = new Date(dateStr);
  const end = new Date(start);
  end.setDate(end.getDate() + 3);

  const startMonth = hebrewMonths[start.getMonth()];
  const endMonth = hebrewMonths[end.getMonth()];
  const year = end.getFullYear();

  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()}-${end.getDate()} ${startMonth} ${year}`;
  }
  return `${start.getDate()} ${startMonth} - ${end.getDate()} ${endMonth} ${year}`;
}

export function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

export function formatHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

export function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
}

/** Get the date string (YYYY-MM-DD) for a Date object */
export function toDateStr(date: Date): string {
  return date.toISOString().split('T')[0];
}

/** Check if two date strings represent the same day */
export function isSameDay(a: string, b: string): boolean {
  return a.split('T')[0] === b.split('T')[0];
}

/** Check if a date string is today */
export function isToday(dateStr: string): boolean {
  return dateStr.split('T')[0] === new Date().toISOString().split('T')[0];
}

/** Get hour + fraction from an ISO date string (e.g., 16:30 => 16.5) */
export function getTimePosition(dateStr: string): number {
  const date = new Date(dateStr);
  return date.getHours() + date.getMinutes() / 60;
}

/** Get event duration in hours */
export function getEventDuration(startStr: string, endStr: string | null): number {
  if (!endStr) return 1; // Default 1 hour
  const start = new Date(startStr);
  const end = new Date(endStr);
  const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  return Math.max(0.5, Math.min(hours, 24)); // Clamp between 30min and 24h
}
