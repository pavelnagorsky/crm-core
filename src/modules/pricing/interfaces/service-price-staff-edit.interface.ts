/** A personal price the file sets; null removes it. */
export interface ServicePriceStaffEdit {
  row: number;
  serviceId: string;
  staffId: string;
  price: string | null;
}
