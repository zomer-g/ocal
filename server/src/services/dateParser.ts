/**
 * Multi-format date/time parser for Israeli public calendar data.
 *
 * Supports:
 * 1. Excel serial numbers (e.g., 45882 → 2025-08-13)
 * 2. Excel decimal time fractions (e.g., 0.6875 → 16:30)
 * 3. ISO timestamps (e.g., 2025-01-01T08:30:00)
 * 4. YYYY-MM-DD
 * 5. DD.MM.YYYY or DD/MM/YYYY (Israeli convention)
 * 6. HH:MM or HH:MM:SS time strings
 * 7. Combined date+time in a single field
 */

/** Convert Excel serial number to Date */
function excelSerialToDate(serial: number): Date {
  // Excel epoch: 1900-01-01 = serial 1
  // But Excel has the 1900 leap year bug, so we use the standard offset: 25569
  // (days between 1900-01-01 and 1970-01-01, adjusted for the bug)
  return new Date((serial - 25569) * 86400 * 1000);
}

/** Convert Excel decimal time fraction to hours and minutes */
function excelTimeToHoursMinutes(timeFraction: number): { hours: number; minutes: number } {
  const totalMinutes = Math.round(timeFraction * 24 * 60);
  return {
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
  };
}

/** Check if a value is an Excel serial date number (reasonable range: 1900-2100) */
function isExcelSerial(value: unknown): value is number {
  return typeof value === 'number' && value > 1 && value < 73050; // up to year ~2100
}

/** Check if a value is an Excel time fraction (0.0 to 0.99999) */
function isExcelTimeFraction(value: unknown): value is number {
  return typeof value === 'number' && value >= 0 && value < 1;
}

/**
 * Parse a date value from various formats.
 * Returns a Date object or null if unparseable.
 */
export function parseDate(value: unknown): Date | null {
  if (value == null || value === '') return null;

  // JavaScript Date object (returned by SheetJS for XLSX date cells)
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  // Excel serial number
  if (isExcelSerial(value)) {
    return excelSerialToDate(value);
  }

  if (typeof value !== 'string') {
    // Try converting number to string
    if (typeof value === 'number') return null;
    return null;
  }

  const str = value.trim();
  if (!str) return null;

  // ISO timestamp: 2025-01-01T08:30:00
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
    const date = new Date(str);
    if (!isNaN(date.getTime())) return date;
  }

  // YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const date = new Date(+isoMatch[1], +isoMatch[2] - 1, +isoMatch[3]);
    if (!isNaN(date.getTime())) return date;
  }

  // DD.MM.YYYY or DD/MM/YYYY  — Israeli convention is day-first, but Outlook
  // exports running on a US-locale machine emit M/D/YYYY with the same
  // separators. Naively assuming day-first lets a value like "1/16/2025"
  // become new Date(2025, 15, 1) which JS silently wraps to 2026-04-01,
  // producing ghost-year events. Use makeStrictDate to validate, and if the
  // day-first reading is impossible (month > 12) but the swapped reading is
  // valid, accept it as US-format.
  const dmyMatch = str.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (dmyMatch) {
    const a = +dmyMatch[1];
    const b = +dmyMatch[2];
    const y = +dmyMatch[3];
    const dayFirst = makeStrictDate(y, b, a);   // a=day, b=month
    if (dayFirst) return dayFirst;
    const monthFirst = makeStrictDate(y, a, b); // a=month, b=day
    if (monthFirst) return monthFirst;
  }

  // DD.MM.YY or DD/MM/YY
  const dmyShortMatch = str.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2})$/);
  if (dmyShortMatch) {
    const year = +dmyShortMatch[3] + 2000;
    const a = +dmyShortMatch[1];
    const b = +dmyShortMatch[2];
    const dayFirst = makeStrictDate(year, b, a);
    if (dayFirst) return dayFirst;
    const monthFirst = makeStrictDate(year, a, b);
    if (monthFirst) return monthFirst;
  }

  // Embedded DD/MM/YYYY within a longer string (e.g. "יום ב 01/04/2024 11:30")
  // Strips Hebrew day-of-week prefix and trailing time
  const embeddedMatch = str.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (embeddedMatch) {
    const a = +embeddedMatch[1];
    const b = +embeddedMatch[2];
    const y = +embeddedMatch[3];
    const dayFirst = makeStrictDate(y, b, a);
    if (dayFirst) return dayFirst;
    const monthFirst = makeStrictDate(y, a, b);
    if (monthFirst) return monthFirst;
  }

  return null;
}

/**
 * Build a Date from (year, month, day) and verify the JS Date constructor
 * didn't silently wrap an invalid month/day into the next month/year. JS
 * happily turns new Date(2025, 15, 1) into 2026-04-01 — the bug that caused
 * 195 ghost events in 2026/2027 for an Outlook M/D/YYYY-exported diary.
 * Returns null if month/day are out of range or the round-trip mismatches.
 */
function makeStrictDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

/**
 * Parse a time value from various formats.
 * Returns { hours, minutes } or null.
 */
export function parseTime(value: unknown): { hours: number; minutes: number } | null {
  if (value == null || value === '') return null;

  // Excel decimal time fraction (0.0 to 0.9999...)
  if (isExcelTimeFraction(value)) {
    return excelTimeToHoursMinutes(value);
  }

  if (typeof value === 'number') {
    // Could be hours as integer (e.g., 14 = 14:00)
    if (value >= 0 && value <= 23) {
      return { hours: Math.floor(value), minutes: 0 };
    }
    return null;
  }

  if (typeof value !== 'string') return null;

  const str = value.trim();

  // HH:MM or HH:MM:SS (standalone or at end of combined string like "יום ב 01/04/2024 11:30")
  const timeMatch = str.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (timeMatch) {
    const hours = +timeMatch[1];
    const minutes = +timeMatch[2];
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return { hours, minutes };
    }
  }

  return null;
}

/**
 * Combine a date and optional time into a single Date.
 * Handles all format combinations: Excel serial + decimal time,
 * string date + string time, etc.
 */
export function parseDateTime(
  dateValue: unknown,
  timeValue?: unknown
): Date | null {
  const date = parseDate(dateValue);
  if (!date) return null;

  if (timeValue != null && timeValue !== '') {
    const time = parseTime(timeValue);
    if (time) {
      date.setHours(time.hours, time.minutes, 0, 0);
    }
  } else if (typeof dateValue === 'string') {
    // Try to extract time from combined date+time string (e.g. "יום ב 01/04/2024 11:30")
    const time = parseTime(dateValue);
    if (time) {
      date.setHours(time.hours, time.minutes, 0, 0);
    }
  }

  return date;
}

/**
 * Format a Date to ISO string in Israel timezone (UTC+2/+3).
 */
export function toISOString(date: Date): string {
  return date.toISOString();
}
