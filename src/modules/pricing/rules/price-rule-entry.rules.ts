import {
  PriceRuleKind as PrismaPriceRuleKind,
  PriceRuleTargetType as PrismaPriceRuleTargetType,
  PriceScheduleType as PrismaPriceScheduleType,
  PriceValueType as PrismaPriceValueType,
} from '@prisma/client';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { PriceRuleKind } from '../engine/enums/price-rule-kind.enum.js';
import { PriceRuleTargetType } from '../engine/enums/price-rule-target-type.enum.js';
import { PriceScheduleType } from '../engine/enums/price-schedule-type.enum.js';
import { PriceValueType } from '../engine/enums/price-value-type.enum.js';
import { PromotionChannel } from '../engine/enums/promotion-channel.enum.js';
import { PromotionClientFilter } from '../engine/enums/promotion-client-filter.enum.js';
import { PromotionLimitPeriod } from '../engine/enums/promotion-limit-period.enum.js';
import { PricingPromotionEntry } from '../engine/interfaces/pricing-promotion-entry.interface.js';
import { PricingRuleEntry } from '../engine/interfaces/pricing-rule-entry.interface.js';
import { PriceRuleRecord } from '../interfaces/price-rule-record.interface.js';

const day = (date: Date | null): string | null =>
  date ? TimeUtils.dateOnlyStr(date) : null;

/**
 * A stored rule as the price engine reads it: percent in basis points and amount in minor
 * units (both are hundredths of the stored decimal), dates as YYYY-MM-DD.
 */
export function toPricingRuleEntry(rule: PriceRuleRecord): PricingRuleEntry {
  const kind = rule.kind as PrismaPriceRuleKind as string as PriceRuleKind;
  return {
    id: rule.id,
    kind,
    name: rule.name,
    scheduleType:
      rule.scheduleType as PrismaPriceScheduleType as string as PriceScheduleType,
    enabled: rule.enabled,
    valueType:
      rule.valueType as PrismaPriceValueType as string as PriceValueType,
    value: MoneyUtils.toMinor(rule.value),
    visitFrom: day(rule.visitFrom),
    visitTo: day(rule.visitTo),
    yearly: rule.yearly,
    holidayExclusive: rule.holidayExclusive,
    weekdaysMask: rule.weekdaysMask,
    intervals: rule.intervals.map((interval) => ({
      start: interval.startMinute,
      end: interval.endMinute,
    })),
    dates: rule.dates.map((item) => TimeUtils.dateOnlyStr(item.date)),
    appliesToAll: rule.appliesToAll,
    targets: rule.targets.map((target) => ({
      type: target.targetType as PrismaPriceRuleTargetType as string as PriceRuleTargetType,
      id: target.targetId,
      excluded: target.excluded,
    })),
    promotion:
      kind === PriceRuleKind.PROMOTION ? toPricingPromotionEntry(rule) : null,
    createdAt: rule.createdAt.toISOString(),
  };
}

function toPricingPromotionEntry(rule: PriceRuleRecord): PricingPromotionEntry {
  return {
    publicName: rule.publicName ?? rule.name,
    showAsPromotion: rule.showAsPromotion,
    bookingFrom: day(rule.bookingFrom),
    bookingTo: day(rule.bookingTo),
    minLeadMinutes: rule.minLeadMinutes,
    maxLeadMinutes: rule.maxLeadMinutes,
    channels: (rule.channels ?? []).map(
      (channel) => channel as string as PromotionChannel,
    ),
    staffIds: rule.staff.map((item) => item.staffId),
    clientFilter: rule.clientFilter as string as PromotionClientFilter,
    birthdayWindowDays: rule.birthdayWindowDays,
    promoCode: rule.promoCode?.toUpperCase() ?? null,
    usageLimitTotal: rule.usageLimitTotal,
    usageLimitPerClient: rule.usageLimitPerClient,
    usageLimitPeriod:
      rule.usageLimitPeriod === null
        ? null
        : (rule.usageLimitPeriod as string as PromotionLimitPeriod),
    minVisitTotal:
      rule.minVisitTotal === null
        ? null
        : MoneyUtils.toMinor(rule.minVisitTotal),
  };
}
