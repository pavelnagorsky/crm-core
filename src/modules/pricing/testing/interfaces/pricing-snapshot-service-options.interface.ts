import { PricedLocationProduct } from '../../../products/interfaces/priced-location-product.interface.js';
import { PriceLevel } from '@prisma/client';
import { BookingCatalogSnapshot } from '../../../services/catalog/interfaces/booking-catalog-snapshot.interface.js';
import { StaffPricingProfile } from '../../../staff/interfaces/staff-pricing-profile.interface.js';
import { PricingPriceChangeEntry } from '../../engine/interfaces/pricing-price-change-entry.interface.js';
import { PriceRuleRecord } from '../../interfaces/price-rule-record.interface.js';
import { ServiceLevelPriceRow } from '../../interfaces/service-level-price-row.interface.js';

export interface PricingSnapshotServiceOptions {
  catalog?: BookingCatalogSnapshot;
  levels?: PriceLevel[];
  levelPrices?: ServiceLevelPriceRow[];
  staff?: StaffPricingProfile[];
  rules?: PriceRuleRecord[];
  /** Location rounding step as the database returns it. */
  roundingStep?: string;
  /** The cache is on by default: pass false to run without it. */
  cacheEnabled?: boolean;
  /** IANA zone of the location; UTC when omitted. */
  timezone?: string;
  /** Scheduled price changes the reader returns. */
  priceChanges?: PricingPriceChangeEntry[];
  /** Priced products of the location (ProductsService.listPriced). */
  products?: PricedLocationProduct[];
}
