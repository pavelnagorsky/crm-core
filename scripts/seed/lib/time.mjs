// Pure time helpers ported from src/modules/time/time.service.ts so the seed
// encodes dates/times exactly the way the running application does.

function pad(n, width) {
  return String(n).padStart(width, '0');
}

/** Converts a UTC Date to wall-clock parts in the given IANA timezone. */
export function toZonedParts(date, timezone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map(({ type, value }) => [type, value]));
  return {
    year: parseInt(parts.year),
    month: parseInt(parts.month),
    day: parseInt(parts.day),
    hour: parseInt(parts.hour) % 24,
    minute: parseInt(parts.minute),
    second: parseInt(parts.second),
  };
}

/**
 * Converts a local wall-clock string (YYYY-MM-DDTHH:mm:ss, no offset) interpreted
 * in the given IANA timezone to a UTC Date. One correction pass, as in TimeService.
 */
export function localToUtc(localDateStr, timezone) {
  const [datePart, timePart] = localDateStr.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute, second = 0] = timePart.split(':').map(Number);

  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const zonedParts = toZonedParts(utcGuess, timezone);
  const guessMinutes = hour * 60 + minute;
  const zonedMinutes = zonedParts.hour * 60 + zonedParts.minute;
  const offsetMinutes = guessMinutes - zonedMinutes;
  return new Date(utcGuess.getTime() + offsetMinutes * 60_000);
}

/** Parses "YYYY-MM-DD" as UTC midnight, matching Prisma "@db.Date". */
export function dateOnly(isoDate) {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

/** Formats a @db.Date value (UTC-midnight Date) as "YYYY-MM-DD". */
export function dateOnlyStr(date) {
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1, 2)}-${pad(date.getUTCDate(), 2)}`;
}

/** Formats a UTC Date as "YYYY-MM-DD" in the target timezone. */
export function zonedDateStr(date, timezone) {
  const p = toZonedParts(date, timezone);
  return `${pad(p.year, 4)}-${pad(p.month, 2)}-${pad(p.day, 2)}`;
}

/**
 * Builds a @db.Time value from "HH:mm" the same way staff.service.ts parseTime does:
 * epoch-zero Date carrying the naive wall-clock time in its UTC components.
 */
export function parseTimeToDbTime(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(0);
  d.setUTCHours(h, m, 0, 0);
  return d;
}

/** ISO weekday (1=Mon .. 7=Sun) for a calendar date. */
export function isoWeekday(year, month, day) {
  const js = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return js === 0 ? 7 : js;
}

/** Adds N days to a "YYYY-MM-DD" string, calendar-only (no TZ). */
export function addDaysStr(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return `${pad(shifted.getUTCFullYear(), 4)}-${pad(shifted.getUTCMonth() + 1, 2)}-${pad(shifted.getUTCDate(), 2)}`;
}

/** Inclusive list of "YYYY-MM-DD" strings between two dates (UTC calendar iteration). */
export function enumerateDates(fromStr, toStr) {
  const [fy, fm, fd] = fromStr.split('-').map(Number);
  const [ty, tm, td] = toStr.split('-').map(Number);
  const end = Date.UTC(ty, tm - 1, td);
  const result = [];
  for (let ms = Date.UTC(fy, fm - 1, fd); ms <= end; ms += 86_400_000) {
    const d = new Date(ms);
    result.push(`${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}`);
  }
  return result;
}

export function minutesToHHmm(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${pad(h, 2)}:${pad(m, 2)}`;
}

export function hhmmToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
