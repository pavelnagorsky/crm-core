import { StaffServicePriceView } from './staff-service-price-view.interface.js';

export interface StaffServicePricesView {
  staffId: string;
  /** Null: the default level. */
  levelId: string | null;
  items: StaffServicePriceView[];
}
