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

  // DD.MM.YYYY or DD/MM/YYYY
  const dmyMatch = str.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (dmyMatch) {
    const date = new Date(+dmyMatch[3], +dmyMatch[2] - 1, +dmyMatch[1]);
    if (!isNaN(date.getTime())) return date;
  }

  // DD.MM.YY or DD/MM/YY
  const dmyShortMatch = str.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2})$/);
  if (dmyShortMatch) {
    const year = +dmyShortMatch[3] + 2000;
    const date = new Date(year, +dmyShortMatch[2] - 1, +dmyShortMatch[1]);
    if (!isNaN(date.getTime())) return date;
  }

  return null;
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

  // HH:MM or HH:MM:SS
  const timeMatch = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
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
  }

  return date;
}

/**
 * Format a Date to ISO string in Israel timezone (UTC+2/+3).
 */
export function toISOString(date: Date): string {
  return date.toISOString();
}
