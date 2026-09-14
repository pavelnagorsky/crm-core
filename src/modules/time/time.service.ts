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
   * Returns current UTC Date interpreted as wall-clock date in the given timezone.
   * Useful for "what day is it right now in the business's timezone".
   */
  nowInTimezone(timezone: string): Date {
    const now = new Date();
    const { year, month, day, hour, minute, second } = this.toZonedParts(now, timezone);
    return new Date(year, month - 1, day, hour, minute, second);
  }

  /**
   * Converts a wall-clock Date in the given IANA timezone to UTC.
   * The input Date is treated as local time in that timezone, not as UTC.
   */
  fromZonedToUtc(localDate: Date, timezone: string): Date {
    const utcTimestamp = Date.UTC(
      localDate.getFullYear(),
      localDate.getMonth(),
      localDate.getDate(),
      localDate.getHours(),
      localDate.getMinutes(),
      localDate.getSeconds(),
    );

    // Find the UTC offset for the given timezone at this approximate UTC time
    const probe = new Date(utcTimestamp);
    const { year, month, day, hour, minute, second } = this.toZonedParts(probe, timezone);

    const zonedAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
    const offsetMs = zonedAsUtc - utcTimestamp;

    return new Date(utcTimestamp - offsetMs);
  }

  /**
   * Returns UTC offset in minutes for a given timezone at a specific moment.
   * Positive = ahead of UTC (e.g. UTC+3 → 180).
   */
  getUtcOffsetMinutes(timezone: string, at: Date = new Date()): number {
    const { year, month, day, hour, minute, second } = this.toZonedParts(at, timezone);
    const zonedAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
    return Math.round((zonedAsUtc - at.getTime()) / 60_000);
  }

  /**
   * Formats a UTC Date as an ISO-8601 string in the given timezone (no conversion to UTC).
   * Example: "2026-09-18T14:00:00" in "Europe/Minsk"
   */
  formatInTimezone(date: Date, timezone: string): string {
    const { year, month, day, hour, minute, second } = this.toZonedParts(date, timezone);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}`;
  }

  /**
   * Checks whether two UTC dates fall on the same calendar day in the given timezone.
   */
  isSameDay(a: Date, b: Date, timezone: string): boolean {
    const pa = this.toZonedParts(a, timezone);
    const pb = this.toZonedParts(b, timezone);
    return pa.year === pb.year && pa.month === pb.month && pa.day === pb.day;
  }

  /**
   * Returns the start (00:00:00) and end (23:59:59) of a calendar day in UTC
   * for the given timezone and wall-clock date.
   */
  dayBoundsUtc(
    year: number,
    month: number,
    day: number,
    timezone: string,
  ): { start: Date; end: Date } {
    const start = this.fromZonedToUtc(new Date(year, month - 1, day, 0, 0, 0), timezone);
    const end = this.fromZonedToUtc(new Date(year, month - 1, day, 23, 59, 59), timezone);
    return { start, end };
  }
}
