/** One non-empty row of the sheet "Личные цены". */
export interface ServicePriceStaffRow {
  row: number;
  serviceId: string;
  staffId: string;
  price: string;
}
