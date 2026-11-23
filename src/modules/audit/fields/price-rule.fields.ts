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
  ];
