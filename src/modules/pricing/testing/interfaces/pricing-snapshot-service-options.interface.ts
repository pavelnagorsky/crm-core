import { PriceLevel } from '@prisma/client';
import { BookingCatalogSnapshot } from '../../../services/catalog/interfaces/booking-catalog-snapshot.interface.js';
import { StaffPricingProfile } from '../../../staff/interfaces/staff-pricing-profile.interface.js';
import { ServiceLevelPriceRow } from '../../interfaces/service-level-price-row.interface.js';

export interface PricingSnapshotServiceOptions {
  catalog?: BookingCatalogSnapshot;
  levels?: PriceLevel[];
  levelPrices?: ServiceLevelPriceRow[];
  staff?: StaffPricingProfile[];
  /** The cache is on by default: pass false to run without it. */
  cacheEnabled?: boolean;
}
