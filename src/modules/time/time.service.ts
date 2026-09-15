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

  /** Reads the naive UTC HH:mm from a @db.Time Date (stored as epoch-zero UTC offset). */
  timeToMinutes(dt: Date): number {
    return dt.getUTCHours() * 60 + dt.getUTCMinutes();
  }

  minutesToHHmm(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}
