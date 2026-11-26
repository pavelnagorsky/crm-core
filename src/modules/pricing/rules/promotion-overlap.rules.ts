import { Prisma } from '@prisma/client';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { CalendarDayParser } from '../engine/compile/calendar-day.parser.js';
import { CompiledRule } from '../engine/compile/compiled-rule.js';
import { PriceRuleTargetType } from '../engine/enums/price-rule-target-type.enum.js';
import { RuleTargetKind } from '../engine/enums/rule-target-kind.enum.js';
import { PricingRuleEntry } from '../engine/interfaces/pricing-rule-entry.interface.js';
import { PromotionOverlap } from '../interfaces/promotion-overlap.interface.js';
import { PromotionOverlapScope } from '../interfaces/promotion-overlap-scope.interface.js';

/** Days ahead searched for a common day: a year and a bit covers every weekly pattern. */
const OVERLAP_HORIZON_DAYS = 370;
const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

const intersects = <T>(a: readonly T[], b: readonly T[]): boolean =>
  a.some((item) => b.includes(item));

/** Both limit staff: they must share one; an empty list is every staff member. */
function staffMeet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === 0 || b.length === 0 || intersects(a, b);
}

/** First local date and minute from today when both rules cover the visit start. */
function firstCommonStart(
  a: CompiledRule,
  b: CompiledRule,
  today: string,
): { date: string; minute: number } | null {
  const minutes = [...new Set([0, ...a.breakpoints, ...b.breakpoints])].sort(
    (x, y) => x - y,
  );
  let date = today;
  for (let step = 0; step < OVERLAP_HORIZON_DAYS; step += 1) {
    const day = CalendarDayParser.parse(date);
    if (a.coversDay(day) && b.coversDay(day)) {
      const minute = minutes.find(
        (item) => a.coversMinute(item) && b.coversMinute(item),
      );
      if (minute !== undefined) return { date, minute };
    }
    date = TimeUtils.addDaysStr(date, 1);
  }
  return null;
}

const PRODUCT_TYPES: readonly PriceRuleTargetType[] = [
  PriceRuleTargetType.PRODUCT,
  PriceRuleTargetType.PRODUCT_CATEGORY,
];

/** Every service and bundle (or every product), nothing of that kind excluded. */
function reachesAll(entry: PricingRuleEntry, kind: RuleTargetKind): boolean {
  const products = kind === RuleTargetKind.PRODUCT;
  const all = products ? entry.appliesToAllProducts : entry.appliesToAllServices;
  return (
    all &&
    entry.targets.every(
      (target) =>
        !target.excluded || PRODUCT_TYPES.includes(target.type) !== products,
    )
  );
}

/**
 * Where and when the two promotions meet, as the admin reads it: the common service or
 * product (or "Все услуги" / "Все товары"), then the weekday when either keeps to weekdays and the time when either
 * keeps to hours. Promotions with no time conditions (new clients, birthday, a code) meet
 * on the service alone.
 */
function overlapExample(
  a: PricingRuleEntry,
  b: PricingRuleEntry,
  scope: PromotionOverlapScope,
  start: { date: string; minute: number },
): string {
  const kind = scope.context.kind;
  const all = kind === RuleTargetKind.PRODUCT ? 'Все товары' : 'Все услуги';
  const parts = [
    reachesAll(a, kind) && reachesAll(b, kind) ? all : scope.title,
  ];
  const weekday =
    a.weekdaysMask !== 0 || b.weekdaysMask !== 0
      ? WEEKDAYS[CalendarDayParser.parse(start.date).isoWeekday - 1]
      : null;
  const time =
    a.intervals.length > 0 || b.intervals.length > 0
      ? TimeUtils.minutesToHHmm(start.minute)
      : null;
  const when = [weekday, time].filter(Boolean).join(' ');
  if (when) parts.push(when);
  return parts.join(', ');
}

/**
 * Enabled promotions that can reach the same visit or sale as the draft: a common service,
 * bundle or product (scopes list services first), channel, staff member and start time from today on. Client conditions, codes and
 * limits are not compared: when both hold, the bigger discount wins.
 */
export function findPromotionOverlaps(
  draft: PricingRuleEntry,
  others: readonly PricingRuleEntry[],
  scopes: readonly PromotionOverlapScope[],
  today: string,
): PromotionOverlap[] {
  const draftPromotion = draft.promotion;
  if (!draftPromotion) return [];
  const draftRule = new CompiledRule({ ...draft, enabled: true });
  const result: PromotionOverlap[] = [];
  for (const entry of others) {
    const promotion = entry.promotion;
    if (!promotion || !entry.enabled || entry.id === draft.id) continue;
    if (!intersects(draftPromotion.channels, promotion.channels)) continue;
    if (!staffMeet(draftPromotion.staffIds, promotion.staffIds)) continue;
    const rule = new CompiledRule(entry);
    const scope = scopes.find(
      (item) =>
        draftRule.targetReason(item.context) === null &&
        rule.targetReason(item.context) === null,
    );
    if (!scope) continue;
    const start = firstCommonStart(draftRule, rule, today);
    if (!start) continue;
    result.push({
      ruleId: entry.id,
      name: entry.name,
      publicName: promotion.publicName,
      valueType: entry.valueType as string as PromotionOverlap['valueType'],
      value: new Prisma.Decimal(entry.value).div(100),
      example: overlapExample(draft, entry, scope, start),
    });
  }
  return result;
}
