import { Injectable } from '@nestjs/common';

@Injectable()
export class TimeService {
  isValidIanaTimezone(timezone: string): boolean {
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
  toZonedParts(
    date: Date,
    timezone: string,
  ): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
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
   * Strategy: parse the components, build a UTC candidate assuming zero offset,
   * measure the actual TZ offset at that instant via toZonedParts, then correct.
   * One correction pass is sufficient for all standard (non-historical-edge) timezones.
   */
  localToUtc(localDateStr: string, timezone: string): Date {
    const [datePart, timePart] = localDateStr.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hour, minute, second] = timePart.split(':').map(Number);

    // Initial UTC guess: treat the local time as if it were UTC
    const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

    // Find what wall-clock time that UTC instant maps to in the target timezone
    const zonedParts = this.toZonedParts(utcGuess, timezone);

    // Compute the offset in minutes: local - zoned = correction needed
    const guessMinutes = hour * 60 + minute;
    const zonedMinutes = zonedParts.hour * 60 + zonedParts.minute;
    const offsetMinutes = guessMinutes - zonedMinutes;

    return new Date(utcGuess.getTime() + offsetMinutes * 60_000);
  }

  /** Converts a UTC Date to minutes-of-day (0–1439) in the given IANA timezone. */
  dateToMinutes(dt: Date, timezone: string): number {
    const parts = this.toZonedParts(dt, timezone);
    return parts.hour * 60 + parts.minute;
  }

  /**
   * Returns the UTC instant corresponding to 00:00 wall-clock on the given calendar day
   * in the target timezone. Out-of-range day/month components (e.g. day=32, day=-1) are
   * normalized via Date.UTC arithmetic before being re-anchored in the timezone.
   */
  zonedDayStart(year: number, month: number, day: number, timezone: string): Date {
    const normalized = new Date(Date.UTC(year, month - 1, day));
    const local = `${pad(normalized.getUTCFullYear(), 4)}-${pad(normalized.getUTCMonth() + 1, 2)}-${pad(normalized.getUTCDate(), 2)}T00:00:00`;
    return this.localToUtc(local, timezone);
  }

  /** Shifts a UTC Date by N calendar days in the target timezone, snapping to midnight. */
  addDaysInTz(date: Date, days: number, timezone: string): Date {
    const p = this.toZonedParts(date, timezone);
    return this.zonedDayStart(p.year, p.month, p.day + days, timezone);
  }

  /**
   * Returns the UTC instant of HH:00 on the given calendar day in the target timezone.
   * Handles out-of-range hour (e.g. 24, -1) and day via Date.UTC normalization.
   */
  zonedHourStart(year: number, month: number, day: number, hour: number, timezone: string): Date {
    const normalized = new Date(Date.UTC(year, month - 1, day, hour));
    const local = `${pad(normalized.getUTCFullYear(), 4)}-${pad(normalized.getUTCMonth() + 1, 2)}-${pad(normalized.getUTCDate(), 2)}T${pad(normalized.getUTCHours(), 2)}:00:00`;
    return this.localToUtc(local, timezone);
  }

  /** Returns the ISO weekday (1 = Monday .. 7 = Sunday) for the given calendar date. */
  isoWeekday(year: number, month: number, day: number): number {
    const js = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    return js === 0 ? 7 : js;
  }

  /** Formats a UTC Date as "YYYY-MM-DD" in the target timezone. */
  zonedDateStr(date: Date, timezone: string): string {
    const p = this.toZonedParts(date, timezone);
    return `${pad(p.year, 4)}-${pad(p.month, 2)}-${pad(p.day, 2)}`;
  }

  /**
   * Formats a "@db.Date" value (Prisma reads it as JS Date at UTC midnight) as "YYYY-MM-DD".
   * Timezone-agnostic: uses UTC components so the calendar day matches the stored value
   * regardless of the process/server timezone.
   */
  dateOnlyStr(date: Date): string {
    return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1, 2)}-${pad(date.getUTCDate(), 2)}`;
  }

  /**
   * Returns inclusive list of "YYYY-MM-DD" strings between fromStr and toStr, calendar-only.
   * Both inputs must be "YYYY-MM-DD" strings; iteration is done in UTC to avoid TZ drift.
   */
  enumerateDates(fromStr: string, toStr: string): string[] {
    const [fy, fm, fd] = fromStr.split('-').map(Number);
    const [ty, tm, td] = toStr.split('-').map(Number);
    const end = Date.UTC(ty, tm - 1, td);
    const result: string[] = [];
    for (let ms = Date.UTC(fy, fm - 1, fd); ms <= end; ms += 86_400_000) {
      const d = new Date(ms);
      result.push(`${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}`);
    }
    return result;
  }

  /** Adds N days to a "YYYY-MM-DD" string, calendar-only (no TZ involved). */
  addDaysStr(dateStr: string, days: number): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    const shifted = new Date(Date.UTC(y, m - 1, d + days));
    return `${pad(shifted.getUTCFullYear(), 4)}-${pad(shifted.getUTCMonth() + 1, 2)}-${pad(shifted.getUTCDate(), 2)}`;
  }

  /** Reads the naive UTC HH:mm from a @db.Time Date (stored as epoch-zero UTC offset). */
  timeToMinutes(dt: Date): number {
    return dt.getUTCHours() * 60 + dt.getUTCMinutes();
  }

  minutesToHHmm(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  hhmmToMinutes(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  }
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}
