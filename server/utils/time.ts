/**
 * Time and Timezone utilities supporting APP_TIMEZONE (Asia/Kolkata default),
 * times past 24:00:00 (GTFS standard), and relative date queries ("now", "today", "tomorrow").
 */

export const DEFAULT_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Kolkata';

export interface TimeContext {
  dateStr: string; // YYYY-MM-DD
  timeStr: string; // HH:MM
  minutesFromMidnight: number;
  dayOfWeek: number; // 0=Sunday, 1=Monday, ..., 6=Saturday
}

/**
 * Gets the current date, time, and day of week in the configured application timezone.
 */
export function getNowInTimezone(timezone = DEFAULT_TIMEZONE, referenceDate = new Date()): TimeContext {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(referenceDate);
  const partMap: Record<string, string> = {};
  for (const part of parts) {
    partMap[part.type] = part.value;
  }

  const dateStr = `${partMap.year}-${partMap.month}-${partMap.day}`;
  const hour = parseInt(partMap.hour || '0', 10);
  const minute = parseInt(partMap.minute || '0', 10);
  const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  const minutesFromMidnight = hour * 60 + minute;

  // Day of week calculation in target timezone
  const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  });
  const weekdayStr = weekdayFormatter.format(referenceDate);
  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const dayOfWeek = dayMap[weekdayStr] ?? 0;

  return {
    dateStr,
    timeStr,
    minutesFromMidnight,
    dayOfWeek,
  };
}

/**
 * Parses time string like "06:30", "14:15:00", or GTFS past-midnight "25:30:00"
 * into minutes from midnight (can exceed 1440 for times past 24:00).
 */
export function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.trim().split(':');
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  const seconds = parts[2] ? parseInt(parts[2], 10) || 0 : 0;
  return hours * 60 + minutes + Math.floor(seconds / 60);
}

/**
 * Formats minutes from midnight into 24-hour time "HH:MM",
 * wrapping around modulo 24 if past 24 hours, but optionally noting next day.
 */
export function formatMinutesToTime(
  totalMinutes: number,
  includeNextDayNotice = true
): string {
  const normMin = Math.round(totalMinutes);
  const days = Math.floor(normMin / 1440);
  const remainder = ((normMin % 1440) + 1440) % 1440;
  const h = Math.floor(remainder / 60);
  const m = remainder % 60;
  const hhmm = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  if (days > 0 && includeNextDayNotice) {
    return `${hhmm} +${days}d`;
  }
  return hhmm;
}

/**
 * Resolves a date input string ("now", "today", "tomorrow", or ISO "YYYY-MM-DD")
 * into a concrete ISO date (YYYY-MM-DD) and departure time (HH:MM)
 * evaluated in the application's timezone.
 */
export function resolveDateAndTime(
  dateInput?: string,
  timeInput?: string,
  timezone = DEFAULT_TIMEZONE
): { date: string; departAfterTime: string; isToday: boolean } {
  const now = getNowInTimezone(timezone);
  const inputLower = (dateInput || 'today').trim().toLowerCase();

  let resolvedDate = now.dateStr;
  let resolvedTime = timeInput ? timeInput.trim() : '00:00';
  let isToday = false;

  if (inputLower === 'now') {
    resolvedDate = now.dateStr;
    resolvedTime = now.timeStr;
    isToday = true;
  } else if (inputLower === 'today') {
    resolvedDate = now.dateStr;
    // If no explicit time was passed and user said 'today', default to current time if searching today
    if (!timeInput) {
      resolvedTime = now.timeStr;
    }
    isToday = true;
  } else if (inputLower === 'tomorrow') {
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tmrw = getNowInTimezone(timezone, tomorrowDate);
    resolvedDate = tmrw.dateStr;
    if (!timeInput) {
      resolvedTime = '00:00';
    }
    isToday = false;
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(inputLower)) {
    resolvedDate = inputLower;
    isToday = resolvedDate === now.dateStr;
    if (!timeInput && isToday) {
      resolvedTime = now.timeStr;
    }
  }

  // Ensure resolvedTime is valid HH:MM
  const timeMatch = resolvedTime.match(/^(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    const h = parseInt(timeMatch[1], 10).toString().padStart(2, '0');
    const m = timeMatch[2];
    resolvedTime = `${h}:${m}`;
  } else {
    resolvedTime = '00:00';
  }

  return {
    date: resolvedDate,
    departAfterTime: resolvedTime,
    isToday,
  };
}

/**
 * Formats a Date object to YYYYMMDD for GTFS date lookup
 */
export function formatToGtfsDate(dateStr: string): string {
  // dateStr is YYYY-MM-DD
  return dateStr.replace(/-/g, '');
}

/**
 * Returns the day of the week for a given YYYY-MM-DD string
 * 0 = Sunday, 1 = Monday, ..., 6 = Saturday
 */
export function getDayOfWeekForDate(dateStr: string): number {
  const parts = dateStr.split('-').map(Number);
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12, 0, 0));
  return d.getUTCDay();
}
