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
  appliesToAllServices: boolean;
  appliesToAllProducts: boolean;
  /** Services, categories, bundles, products and product categories; exclusions with "-". */
  targets: string;
  scenario: string | null;
  publicName: string | null;
  publicDescription: string | null;
  showAsPromotion: boolean;
  bookingFrom: string | null;
  bookingTo: string | null;
  minLeadMinutes: number | null;
  maxLeadMinutes: number | null;
  channels: string;
  staff: string;
  clientFilter: string;
  birthdayWindowDays: number | null;
  promoCode: string | null;
  usageLimitTotal: number | null;
  usageLimitPerClient: number | null;
  usageLimitPeriod: string | null;
  minVisitTotal: string | null;
}
