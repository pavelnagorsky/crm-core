import { getDaysInMonth, parseISO } from 'date-fns';
import { ZonedDateParts } from './interfaces/zoned-date-parts.interface.js';

export class TimeUtils {
  private static readonly formatters = new Map<string, Intl.DateTimeFormat>();

  private constructor() {}

  static isValidIanaTimezone(timezone: string): boolean {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Converts a UTC Date to wall-clock parts in the given IANA timezone.
   */
  static toZonedParts(date: Date, timezone: string): ZonedDateParts {
    let fmt = this.formatters.get(timezone);
    if (!fmt) {
      fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      });
      this.formatters.set(timezone, fmt);
    }

    const parts = Object.fromEntries(
      fmt.formatToParts(date).map(({ type, value }) => [type, value]),
    );

    return {
      year: parseInt(parts.year),
      month: parseInt(parts.month),
      day: parseInt(parts.day),
      hour: parseInt(parts.hour) % 24, // Intl may return 24 for midnight
      minute: parseInt(parts.minute),
      second: parseInt(parts.second),
    };
  }

  /**
   * Converts a local wall-clock datetime string (YYYY-MM-DDTHH:mm:ss, no offset)
   * interpreted in the given IANA timezone to a UTC Date.
   *
   * During a clock rollback, chooses the earlier occurrence of an ambiguous time.
   * During a clock jump, shifts a nonexistent time forward by the size of the gap.
   */
  static localToUtc(localDateStr: string, timezone: string): Date {
    const [datePart, timePart] = localDateStr.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hour, minute, second] = timePart.split(':').map(Number);

    const wallTime = Date.UTC(year, month - 1, day, hour, minute, second);
    if (!Number.isFinite(wallTime))
      throw new RangeError('Invalid local datetime');

    // Compare complete calendar dates: comparing only hours loses a day when the
    // UTC guess and its local representation fall on opposite sides of midnight.
    // Sampling both sides also captures the two offsets of a timezone transition.
    const offsets = new Set(
      [-36, 0, 36].map((hours) => {
        const instant = wallTime + hours * 3_600_000;
        return this.wallTimeAt(instant, timezone) - instant;
      }),
    );
    const candidates = [...offsets]
      .map((offset) => wallTime - offset)
      .sort((a, b) => a - b);
    const exact = candidates.find(
      (instant) => this.wallTimeAt(instant, timezone) === wallTime,
    );
    if (exact !== undefined) return new Date(exact);

    const afterGap = candidates.find(
      (instant) => this.wallTimeAt(instant, timezone) > wallTime,
    );
    if (afterGap === undefined)
      throw new RangeError('Cannot resolve local datetime');
    return new Date(afterGap);
  }

  private static wallTimeAt(instant: number, timezone: string): number {
    const parts = this.toZonedParts(new Date(instant), timezone);
    return Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
  }

  /** Converts a UTC Date to minutes-of-day (0–1439) in the given IANA timezone. */
  static dateToMinutes(dt: Date, timezone: string): number {
    const parts = TimeUtils.toZonedParts(dt, timezone);
    return parts.hour * 60 + parts.minute;
  }

  /**
   * Returns the UTC instant corresponding to 00:00 wall-clock on the given calendar day
   * in the target timezone. Out-of-range day/month components (e.g. day=32, day=-1) are
   * normalized via Date.UTC arithmetic before being re-anchored in the timezone.
   */
  static zonedDayStart(
    year: number,
    month: number,
    day: number,
    timezone: string,
  ): Date {
    const normalized = new Date(Date.UTC(year, month - 1, day));
    const local = `${pad(normalized.getUTCFullYear(), 4)}-${pad(normalized.getUTCMonth() + 1, 2)}-${pad(normalized.getUTCDate(), 2)}T00:00:00`;
    return TimeUtils.localToUtc(local, timezone);
  }

  /** Shifts a UTC Date by N calendar days in the target timezone, snapping to midnight. */
  static addDaysInTz(date: Date, days: number, timezone: string): Date {
    const p = TimeUtils.toZonedParts(date, timezone);
    return TimeUtils.zonedDayStart(p.year, p.month, p.day + days, timezone);
  }

  /**
   * Shifts a UTC Date by N calendar months in the target timezone, snapping to midnight.
   * The day is clamped to the target month's length, so e.g. March 31 minus one month
   * is February 28/29 rather than rolling over into March.
   */
  static addMonthsInTz(date: Date, months: number, timezone: string): Date {
    const p = TimeUtils.toZonedParts(date, timezone);
    const totalMonths = p.year * 12 + (p.month - 1) + months;
    const year = Math.floor(totalMonths / 12);
    const month = (totalMonths % 12) + 1;
    const day = Math.min(p.day, getDaysInMonth(new Date(year, month - 1, 1)));
    return TimeUtils.zonedDayStart(year, month, day, timezone);
  }

  /**
   * Returns the UTC instant of HH:00 on the given calendar day in the target timezone.
   * Handles out-of-range hour (e.g. 24, -1) and day via Date.UTC normalization.
   */
  static zonedHourStart(
    year: number,
    month: number,
    day: number,
    hour: number,
    timezone: string,
  ): Date {
    const normalized = new Date(Date.UTC(year, month - 1, day, hour));
    const local = `${pad(normalized.getUTCFullYear(), 4)}-${pad(normalized.getUTCMonth() + 1, 2)}-${pad(normalized.getUTCDate(), 2)}T${pad(normalized.getUTCHours(), 2)}:00:00`;
    return TimeUtils.localToUtc(local, timezone);
  }

  /** Returns the ISO weekday (1 = Monday .. 7 = Sunday) for the given calendar date. */
  static isoWeekday(year: number, month: number, day: number): number {
    const js = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    return js === 0 ? 7 : js;
  }

  /** Formats a UTC Date as "YYYY-MM-DD" in the target timezone. */
  static zonedDateStr(date: Date, timezone: string): string {
    const p = TimeUtils.toZonedParts(date, timezone);
    return `${pad(p.year, 4)}-${pad(p.month, 2)}-${pad(p.day, 2)}`;
  }

  /**
   * Parses a "YYYY-MM-DD" string as UTC midnight, matching Prisma "@db.Date".
   */
  static dateOnly(isoDate: string): Date {
    return parseISO(`${isoDate}T00:00:00.000Z`);
  }

  /**
   * Formats a "@db.Date" value (Prisma reads it as JS Date at UTC midnight) as "YYYY-MM-DD".
   * Timezone-agnostic: uses UTC components so the calendar day matches the stored value
   * regardless of the process/server timezone.
   */
  static dateOnlyStr(date: Date): string {
    return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1, 2)}-${pad(date.getUTCDate(), 2)}`;
  }

  /**
   * Returns inclusive list of "YYYY-MM-DD" strings between fromStr and toStr, calendar-only.
   * Both inputs must be "YYYY-MM-DD" strings; iteration is done in UTC to avoid TZ drift.
   */
  static enumerateDates(fromStr: string, toStr: string): string[] {
    const [fy, fm, fd] = fromStr.split('-').map(Number);
    const [ty, tm, td] = toStr.split('-').map(Number);
    const end = Date.UTC(ty, tm - 1, td);
    const result: string[] = [];
    for (let ms = Date.UTC(fy, fm - 1, fd); ms <= end; ms += 86_400_000) {
      const d = new Date(ms);
      result.push(
        `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}`,
      );
    }
    return result;
  }

  /** Calendar length of the UTC month for a "@db.Date" value. */
  static daysInUtcMonth(date: Date): number {
    return getDaysInMonth(
      new Date(date.getUTCFullYear(), date.getUTCMonth(), 1),
    );
  }

  /** Adds N days to a "YYYY-MM-DD" string, calendar-only (no TZ involved). */
  static addDaysStr(dateStr: string, days: number): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    const shifted = new Date(Date.UTC(y, m - 1, d + days));
    return `${pad(shifted.getUTCFullYear(), 4)}-${pad(shifted.getUTCMonth() + 1, 2)}-${pad(shifted.getUTCDate(), 2)}`;
  }

  /** Reads the naive UTC HH:mm from a @db.Time Date (stored as epoch-zero UTC offset). */
  static timeToMinutes(dt: Date): number {
    return dt.getUTCHours() * 60 + dt.getUTCMinutes();
  }

  static minutesToHHmm(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  static hhmmToMinutes(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  }
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}
