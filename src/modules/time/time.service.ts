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
