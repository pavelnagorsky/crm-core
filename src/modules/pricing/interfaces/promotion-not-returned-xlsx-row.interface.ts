/** A row of the "not returned" sheet as cells. */
export interface PromotionNotReturnedXlsxRow extends Record<string, unknown> {
  name: string;
  phone: string;
  email: string;
  visitAt: string;
  staff: string;
  services: string;
}
