import { PublicCatalogProduct } from '../../products/interfaces/public-catalog-product.interface.js';
import { BookingServiceCatalog } from '../../services/catalog/interfaces/booking-service-catalog.interface.js';
import { BookingStaff } from '../../staff/interfaces/booking-staff.interface.js';

export interface BookingSetup {
  catalog: BookingServiceCatalog;
  staff: BookingStaff[];
  products: PublicCatalogProduct[];
}
