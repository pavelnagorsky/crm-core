import { PublicCatalogProduct } from '../../products/interfaces/public-catalog-product.interface.js';
import { BookingServiceCatalog } from '../../services/catalog/interfaces/booking-service-catalog.interface.js';
import { BookingStaff } from '../../staff/interfaces/booking-staff.interface.js';
import { BookingSetupPrices } from './booking-setup-prices.interface.js';

export interface BookingSetup {
  catalog: BookingServiceCatalog;
  staff: BookingStaff[];
  products: PublicCatalogProduct[];
  /** False while the brand's subscription blocks online booking (plan section 6.2). */
  isOnlineBookingAvailable: boolean;
  /** Location.anyStaffEnabled: false means the client must choose a staff member. */
  anyStaffEnabled: boolean;
  /** Prices by catalog item and by staff member. */
  prices: BookingSetupPrices;
}
