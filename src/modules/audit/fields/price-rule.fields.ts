import type { FieldDescriptor } from '../interfaces/field-descriptor.interface.js';
import type { PriceRuleAuditSnapshot } from '../interfaces/price-rule-audit-snapshot.interface.js';

/** Audited fields of a price rule, in the order an update lists them. */
export const PRICE_RULE_AUDIT_FIELDS: FieldDescriptor<PriceRuleAuditSnapshot>[] =
  [
    { key: 'name' },
    { key: 'note' },
    { key: 'enabled', i18n: 'booleanValue' },
    { key: 'scheduleType', i18n: 'priceScheduleType' },
    { key: 'valueType', i18n: 'priceValueType' },
    { key: 'value' },
    { key: 'visitFrom' },
    { key: 'visitTo' },
    { key: 'yearly', i18n: 'booleanValue' },
    { key: 'holidayExclusive', i18n: 'booleanValue' },
    { key: 'weekdays' },
    { key: 'intervals' },
    { key: 'dates' },
    { key: 'appliesToAll', i18n: 'booleanValue' },
    { key: 'targets' },
    { key: 'scenario', i18n: 'promotionScenario' },
    { key: 'publicName' },
    { key: 'publicDescription' },
    { key: 'showAsPromotion', i18n: 'booleanValue' },
    { key: 'bookingFrom' },
    { key: 'bookingTo' },
    { key: 'minLeadMinutes' },
    { key: 'maxLeadMinutes' },
    { key: 'channels' },
    { key: 'staff' },
    { key: 'clientFilter', i18n: 'promotionClientFilter' },
    { key: 'birthdayWindowDays' },
    { key: 'promoCode' },
    { key: 'usageLimitTotal' },
    { key: 'usageLimitPerClient' },
    { key: 'usageLimitPeriod', i18n: 'promotionLimitPeriod' },
    { key: 'minVisitTotal' },
  ];
