import { ServicePriceStaffRow } from './service-price-staff-row.interface.js';

export interface ServicePriceStaffSheet {
  serviceIdHeader: string;
  staffIdHeader: string;
  priceHeader: string;
  rows: ServicePriceStaffRow[];
}
