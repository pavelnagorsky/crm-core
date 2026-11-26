/** One row of the items export. */
export interface PriceAnalyticsXlsxRow extends Record<string, unknown> {
  date: string;
  time: string;
  source: string;
  client: string;
  staff: string;
  title: string;
  itemType: string;
  quantity: number | string;
  regular: number;
  surcharges: number;
  discounts: number;
  received: number;
  changes: string;
}
