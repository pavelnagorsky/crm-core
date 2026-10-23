import { PublicCatalogProduct } from '../../products/interfaces/public-catalog-product.interface.js';
import { BookingServiceCatalog } from '../../services/catalog/interfaces/booking-service-catalog.interface.js';
import { StaffWithAvatar } from '../../staff/interfaces/staff-with-avatar.interface.js';

export interface BookingSetup {
  catalog: BookingServiceCatalog;
  staff: (StaffWithAvatar & { staffServices: { serviceId: string }[] })[];
  products: PublicCatalogProduct[];
}
