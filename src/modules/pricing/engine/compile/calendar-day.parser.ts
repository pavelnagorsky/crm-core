import { CalendarDay } from './interfaces/calendar-day.interface.js';

/** Parses local YYYY-MM-DD dates without a time zone or a clock. */
export class CalendarDayParser {
  private constructor() {}

  static parse(date: string): CalendarDay {
    const year = CalendarDayParser.digits(date, 0, 4);
    const month = CalendarDayParser.digits(date, 5, 7);
    const day = CalendarDayParser.digits(date, 8, 10);
    if (
      date.length !== 10 ||
      date[4] !== '-' ||
      date[7] !== '-' ||
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > CalendarDayParser.daysInMonth(year, month)
    )
      throw new RangeError(`Invalid date ${date}`);
    // getUTCDay: 0 = Sunday; ISO: 1 = Monday ... 7 = Sunday.
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    return {
      date,
      ymd: year * 10000 + month * 100 + day,
      md: month * 100 + day,
      isoWeekday: weekday === 0 ? 7 : weekday,
    };
  }

  private static digits(value: string, from: number, to: number): number {
    let result = 0;
    for (let index = from; index < to; index += 1) {
      const code = value.charCodeAt(index) - 48;
      if (!(code >= 0 && code <= 9))
        throw new RangeError(`Invalid date ${value}`);
      result = result * 10 + code;
    }
    return result;
  }

  private static daysInMonth(year: number, month: number): number {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }
}
