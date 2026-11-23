/** A rule flattened to display strings, so an update is audited field by field. */
export interface PriceRuleAuditSnapshot {
  scheduleType: string;
  name: string;
  note: string | null;
  enabled: boolean;
  valueType: string;
  value: string;
  visitFrom: string | null;
  visitTo: string | null;
  yearly: boolean;
  holidayExclusive: boolean;
  weekdays: string;
  intervals: string;
  dates: string;
  appliesToAll: boolean;
  targets: string;
}
