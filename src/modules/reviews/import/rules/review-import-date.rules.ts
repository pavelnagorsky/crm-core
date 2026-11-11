import regularExpressions from '../../../../shared/regular-expressions.js';
import { TimeUtils } from '../../../../shared/time/time.utils.js';
import { XlsxCellValue } from '../../../../shared/xlsx/interfaces/xlsx-cell-value.interface.js';
import {
  REVIEW_IMPORT_DEFAULT_HOUR,
  REVIEW_IMPORT_MIN_YEAR,
} from '../constants/review-import.constants.js';
import { ImportDate } from '../interfaces/import-date.interface.js';
import { WallClock } from '../interfaces/wall-clock.interface.js';

const pad = (value: number, length = 2) => String(value).padStart(length, '0');

function wallClock(
  year: string,
  month: string,
  day: string,
  hour?: string,
  minute?: string,
  second?: string,
): WallClock | null {
  const parts: WallClock = {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: hour === undefined ? REVIEW_IMPORT_DEFAULT_HOUR : Number(hour),
    minute: minute === undefined ? 0 : Number(minute),
    second: second === undefined ? 0 : Number(second),
  };
  const probe = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute),
  );
  const exists =
    probe.getUTCFullYear() === parts.year &&
    probe.getUTCMonth() === parts.month - 1 &&
    probe.getUTCDate() === parts.day &&
    probe.getUTCHours() === parts.hour &&
    probe.getUTCMinutes() === parts.minute &&
    parts.second < 60;
  return exists ? parts : null;
}

/** Excel date cells hold the wall-clock time as a UTC moment, independent of the server zone. */
function fromExcelDate(value: Date): WallClock | null {
  if (Number.isNaN(value.getTime())) return null;
  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
    hour: value.getUTCHours(),
    minute: value.getUTCMinutes(),
    second: value.getUTCSeconds(),
  };
}

function fromText(text: string): WallClock | null {
  const dotted = regularExpressions.dottedDateTime.exec(text);
  if (dotted) {
    const [, day, month, year, hour, minute, second] = dotted;
    return wallClock(year, month, day, hour, minute, second);
  }
  const iso = regularExpressions.isoLocalDateTime.exec(text);
  if (iso) {
    const [, year, month, day, hour, minute, second] = iso;
    return wallClock(year, month, day, hour, minute, second);
  }
  return null;
}

function hasDateOnly(value: Date): boolean {
  return (
    value.getUTCHours() === 0 &&
    value.getUTCMinutes() === 0 &&
    value.getUTCSeconds() === 0
  );
}

/**
 * Review date from a cell. Dates without an offset are wall-clock time of the location;
 * a date without time is placed at noon. Null when unreadable, before 2000 or in the future.
 */
export function parseImportDate(
  value: XlsxCellValue,
  timezone: string,
  now: Date,
): ImportDate | null {
  let clock: WallClock | null = null;
  let at: Date | null = null;

  if (value instanceof Date) {
    clock = fromExcelDate(value);
    if (clock && hasDateOnly(value)) clock.hour = REVIEW_IMPORT_DEFAULT_HOUR;
  } else if (typeof value === 'string') {
    const text = value.trim();
    if (regularExpressions.isoZonedDateTime.test(text)) {
      at = new Date(text);
      if (Number.isNaN(at.getTime())) return null;
    } else clock = fromText(text);
  }

  let key: string;
  if (clock) {
    key = `${pad(clock.year, 4)}-${pad(clock.month)}-${pad(clock.day)}T${pad(clock.hour)}:${pad(clock.minute)}:${pad(clock.second)}`;
    at = TimeUtils.localToUtc(key, timezone);
  } else if (at) key = at.toISOString();
  else return null;

  const year = clock?.year ?? at.getUTCFullYear();
  if (year < REVIEW_IMPORT_MIN_YEAR || at > now) return null;
  return { at, key };
}
