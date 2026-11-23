import { PriceRuleKind, Prisma } from '@prisma/client';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { NormalizedPriceRule } from '../interfaces/normalized-price-rule.interface.js';
import { PriceRuleRecord } from '../interfaces/price-rule-record.interface.js';

/** Id of a rule that is not saved yet. */
export const DRAFT_PRICE_RULE_ID = 'draft';

const day = (date: string | null): Date | null =>
  date === null ? null : TimeUtils.dateOnly(date);

/**
 * A validated rule input as a stored rule that was never saved, so a preview reads it with
 * the same code (status, next date, engine entry, holiday conflicts) as a saved rule.
 */
export function draftPriceRuleRecord(
  locationId: string,
  rule: NormalizedPriceRule,
  options: { id: string; enabled: boolean; createdAt: Date },
): PriceRuleRecord {
  const { id } = options;
  return {
    id,
    locationId,
    kind: PriceRuleKind.SURCHARGE,
    scheduleType: rule.scheduleType,
    name: rule.name,
    note: rule.note,
    enabled: options.enabled,
    archivedAt: null,
    valueType: rule.valueType,
    value: new Prisma.Decimal(rule.value),
    visitFrom: day(rule.visitFrom),
    visitTo: day(rule.visitTo),
    yearly: rule.yearly,
    holidayExclusive: rule.holidayExclusive,
    weekdaysMask: rule.weekdaysMask,
    appliesToAll: rule.appliesToAll,
    createdById: null,
    createdAt: options.createdAt,
    updatedAt: options.createdAt,
    targets: rule.targets.map((target) => ({
      ruleId: id,
      targetType: target.type,
      targetId: target.id,
      excluded: target.excluded,
    })),
    intervals: rule.intervals.map((interval) => ({ ruleId: id, ...interval })),
    dates: rule.dates.map((date) => ({
      ruleId: id,
      date: TimeUtils.dateOnly(date),
    })),
  };
}
