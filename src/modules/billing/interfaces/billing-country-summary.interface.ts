/** GET /admin/billing/countries. */
export interface BillingCountrySummary {
  countryCode: string;
  currency: string;
  /** Plans with a price in force in this country. */
  plansWithPrices: number;
  subscriptions: number;
}
