import {
  PriceValueType,
  PromotionChannel,
  PromotionClientFilter,
  PromotionLimitPeriod,
} from '@prisma/client';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { PriceRuleRecord } from '../interfaces/price-rule-record.interface.js';
import { PromotionConditionsInput } from '../interfaces/promotion-conditions-input.interface.js';

/** Typographic minus of a discount: "−15%". */
const MINUS = '−';
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 1440;
const TARGET_NAME_LIMIT = 3;
const WEEKDAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
/** Months in the genitive: "1 декабря". */
const MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];
const LIMIT_PERIOD_TEXT: Record<PromotionLimitPeriod, string> = {
  [PromotionLimitPeriod.ALL_TIME]: '',
  [PromotionLimitPeriod.YEAR]: ' в год',
  [PromotionLimitPeriod.MONTH]: ' в месяц',
  [PromotionLimitPeriod.WEEK]: ' в неделю',
};
export const PROMOTION_ONE_DISCOUNT_LINE =
  'На услугу действует одна скидка, самая выгодная';

/** Russian plural: one (1, 21), few (2-4, 22-24), many (0, 5-20, 25...). */
function plural(count: number, one: string, few: string, many: string): string {
  const tens = count % 100;
  const units = count % 10;
  if (tens >= 11 && tens <= 14) return many;
  if (units === 1) return one;
  if (units >= 2 && units <= 4) return few;
  return many;
}

/** "40.00" -> "40", "12.50" -> "12,5", "0.05" -> "0,05". */
export function formatPromotionNumber(value: string): string {
  const [whole, fraction = ''] = value.split('.');
  const trimmed = fraction.replace(/0+$/, '');
  return trimmed ? `${whole},${trimmed}` : whole;
}

function money(value: string, currency: string): string {
  return `${formatPromotionNumber(value)} ${currency}`;
}

/** "A", "A и B", "A, B и C". */
function joinAnd(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} и ${items[items.length - 1]}`;
}

/** Up to 3 names, the rest as "и ещё N". */
function nameList(names: readonly string[]): string {
  if (names.length <= TARGET_NAME_LIMIT) return joinAnd(names);
  const rest = names.length - TARGET_NAME_LIMIT;
  return `${names.slice(0, TARGET_NAME_LIMIT).join(', ')} и ещё ${rest}`;
}

function sizeLine(input: PromotionConditionsInput): string {
  const size =
    input.valueType === PriceValueType.PERCENT
      ? `${MINUS}${formatPromotionNumber(input.value)}%`
      : `${MINUS}${money(input.value, input.currency)}`;
  const names = input.targets
    .filter((target) => target.name !== null)
    .map((target) => target.name as string);
  if (input.appliesToAll)
    return names.length === 0
      ? `${size} на все услуги`
      : `${size} на все услуги, кроме: ${nameList(names)}`;
  return `${size} на ${nameList(names)}`;
}

/** "Пн-Чт", "Пн, Ср, Пт", "Пн-Ср, Сб-Вс". */
function weekdaysText(mask: number): string {
  const days = WEEKDAY_NAMES.map((_, index) => (mask & (1 << index)) !== 0);
  const parts: string[] = [];
  let index = 0;
  while (index < 7) {
    if (!days[index]) {
      index += 1;
      continue;
    }
    let end = index;
    while (end + 1 < 7 && days[end + 1]) end += 1;
    if (end - index >= 2)
      parts.push(`${WEEKDAY_NAMES[index]}-${WEEKDAY_NAMES[end]}`);
    else
      for (let day = index; day <= end; day += 1)
        parts.push(WEEKDAY_NAMES[day]);
    index = end + 1;
  }
  return parts.join(', ');
}

function whenLine(input: PromotionConditionsInput): string | null {
  const everyDay = input.weekdaysMask === 0 || input.weekdaysMask === 127;
  if (everyDay && input.intervals.length === 0) return null;
  const days = everyDay ? 'Каждый день' : weekdaysText(input.weekdaysMask);
  if (input.intervals.length === 0) return days;
  const times = input.intervals.map(
    (interval) =>
      `с ${TimeUtils.minutesToHHmm(interval.startMinute)} до ${TimeUtils.minutesToHHmm(interval.endMinute)}`,
  );
  return `${days}, начало визита ${joinAnd(times)}`;
}

function parts(date: string): { year: number; month: number; day: number } {
  const [year, month, day] = date.split('-').map(Number);
  return { year, month, day };
}

function dayMonth(date: string): string {
  const { month, day } = parts(date);
  return `${day} ${MONTHS[month - 1]}`;
}

function fullDate(date: string): string {
  return `${dayMonth(date)} ${parts(date).year}`;
}

/** "1-31 декабря 2026", "1 ноября - 31 декабря 2026", "1 декабря 2026 - 10 января 2027". */
function dateRange(from: string, to: string): string {
  const a = parts(from);
  const b = parts(to);
  if (from === to) return fullDate(from);
  if (a.year !== b.year) return `${fullDate(from)} - ${fullDate(to)}`;
  if (a.month !== b.month) return `${dayMonth(from)} - ${fullDate(to)}`;
  return `${a.day}-${b.day} ${MONTHS[a.month - 1]} ${a.year}`;
}

function visitDatesLine(input: PromotionConditionsInput): string | null {
  const { visitFrom, visitTo } = input;
  if (visitFrom && visitTo) return dateRange(visitFrom, visitTo);
  if (visitFrom) return `С ${fullDate(visitFrom)}, без даты окончания`;
  if (visitTo) return `До ${fullDate(visitTo)}`;
  return null;
}

/** "3 часа", "7 дней", "90 минут". */
export function durationText(minutes: number): string {
  if (minutes > 0 && minutes % MINUTES_PER_DAY === 0) {
    const days = minutes / MINUTES_PER_DAY;
    return `${days} ${plural(days, 'день', 'дня', 'дней')}`;
  }
  if (minutes > 0 && minutes % MINUTES_PER_HOUR === 0) {
    const hours = minutes / MINUTES_PER_HOUR;
    return `${hours} ${plural(hours, 'час', 'часа', 'часов')}`;
  }
  return `${minutes} ${plural(minutes, 'минута', 'минуты', 'минут')}`;
}

/** "Запись с 1 по 30 ноября", "Запись с 1 ноября по 5 декабря", "Запись до 30 ноября". */
function bookingPeriodLine(input: PromotionConditionsInput): string | null {
  const { bookingFrom: from, bookingTo: to } = input;
  if (from && to) {
    const a = parts(from);
    const b = parts(to);
    if (a.year !== b.year) return `Запись с ${fullDate(from)} по ${fullDate(to)}`;
    if (a.month !== b.month) return `Запись с ${dayMonth(from)} по ${dayMonth(to)}`;
    return `Запись с ${a.day} по ${b.day} ${MONTHS[a.month - 1]}`;
  }
  if (from) return `Запись с ${dayMonth(from)}`;
  if (to) return `Запись до ${dayMonth(to)}`;
  return null;
}

function leadLines(input: PromotionConditionsInput): string[] {
  const lines: string[] = [];
  // As the contract names them: maxLead is "no later than N" (last-minute windows),
  // minLead is "no earlier than N" (booking in advance).
  if (input.maxLeadMinutes !== null)
    lines.push(
      `Запись не позже чем за ${durationText(input.maxLeadMinutes)} до визита`,
    );
  if (input.minLeadMinutes !== null)
    lines.push(
      `Запись не раньше чем за ${durationText(input.minLeadMinutes)} до визита`,
    );
  return lines;
}

function clientLine(input: PromotionConditionsInput): string | null {
  if (input.clientFilter === PromotionClientFilter.NEW)
    return 'Для новых клиентов';
  if (input.clientFilter === PromotionClientFilter.BIRTHDAY) {
    const days = input.birthdayWindowDays ?? 0;
    if (days === 0) return 'В день рождения';
    return `В течение ${days} ${plural(days, 'дня', 'дней', 'дней')} до и после дня рождения`;
  }
  return null;
}

function channelLine(input: PromotionConditionsInput): string | null {
  const online = input.channels.includes(PromotionChannel.ONLINE);
  const admin = input.channels.includes(PromotionChannel.ADMIN);
  if (online && !admin) return 'Только онлайн-запись';
  if (admin && !online) return 'Только у администратора';
  return null;
}

function limitLines(input: PromotionConditionsInput): string[] {
  const lines: string[] = [];
  if (input.minVisitTotal !== null)
    lines.push(`Визит от ${money(input.minVisitTotal, input.currency)}`);
  if (input.usageLimitPerClient !== null) {
    const times = input.usageLimitPerClient;
    const period =
      LIMIT_PERIOD_TEXT[input.usageLimitPeriod ?? PromotionLimitPeriod.ALL_TIME];
    lines.push(
      `${times} ${plural(times, 'раз', 'раза', 'раз')}${period} на клиента`,
    );
  }
  if (input.usageLimitTotal !== null && input.usageCount !== null) {
    const left = Math.max(0, input.usageLimitTotal - input.usageCount);
    lines.push(`Осталось ${left} из ${input.usageLimitTotal}`);
  }
  return lines;
}

/**
 * Conditions of a promotion as clients read them (docs/pricing-stage4-api.md, «Условия»):
 * one source for the cabinet, the booking page and the widget. Lines in a fixed order;
 * conditions that do not restrict anything are left out.
 */
export function buildPromotionConditions(
  input: PromotionConditionsInput,
): string[] {
  const lines: (string | null)[] = [
    sizeLine(input),
    whenLine(input),
    visitDatesLine(input),
    ...leadLines(input),
    bookingPeriodLine(input),
    clientLine(input),
    input.staffNames.length > 0
      ? `У мастеров: ${input.staffNames.join(', ')}`
      : null,
    channelLine(input),
    ...limitLines(input),
    PROMOTION_ONE_DISCOUNT_LINE,
  ];
  return lines.filter((line): line is string => line !== null && line !== '');
}

const dateOf = (date: Date | null): string | null =>
  date ? TimeUtils.dateOnlyStr(date) : null;

/** Conditions input of a stored promotion with the names the cabinet resolved. */
export function promotionConditionsInput(
  rule: PriceRuleRecord,
  names: {
    targets: readonly { name: string | null; excluded: boolean }[];
    staffNames: readonly string[];
    currency: string;
    usageCount: number | null;
  },
): PromotionConditionsInput {
  return {
    valueType: rule.valueType,
    value: MoneyUtils.format(rule.value),
    currency: names.currency,
    appliesToAll: rule.appliesToAll,
    targets: [...names.targets],
    weekdaysMask: rule.weekdaysMask,
    intervals: rule.intervals,
    visitFrom: dateOf(rule.visitFrom),
    visitTo: dateOf(rule.visitTo),
    bookingFrom: dateOf(rule.bookingFrom),
    bookingTo: dateOf(rule.bookingTo),
    minLeadMinutes: rule.minLeadMinutes,
    maxLeadMinutes: rule.maxLeadMinutes,
    clientFilter: rule.clientFilter,
    birthdayWindowDays: rule.birthdayWindowDays,
    staffNames: [...names.staffNames],
    channels: rule.channels ?? [],
    minVisitTotal:
      rule.minVisitTotal === null ? null : MoneyUtils.format(rule.minVisitTotal),
    usageLimitTotal: rule.usageLimitTotal,
    usageLimitPerClient: rule.usageLimitPerClient,
    usageLimitPeriod: rule.usageLimitPeriod,
    usageCount: names.usageCount,
  };
}
