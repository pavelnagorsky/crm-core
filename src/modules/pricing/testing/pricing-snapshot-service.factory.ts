import { Prisma, PriceLevel } from '@prisma/client';
import { createTestCache } from '../../../shared/cache/testing/create-test-cache.js';
import { StaffPricingProfile } from '../../staff/interfaces/staff-pricing-profile.interface.js';
import { PriceLevelReadService } from '../services/price-level-read.service.js';
import { PricingSnapshotService } from '../services/pricing-snapshot.service.js';
import { bookingCatalogSnapshot } from './booking-catalog-snapshot.factory.js';
import { PricingSnapshotServiceOptions } from './interfaces/pricing-snapshot-service-options.interface.js';

export function priceLevelRow(
  id: string,
  name: string,
  isDefault = false,
  sortOrder = 0,
): PriceLevel {
  return {
    id,
    locationId: 'location',
    name,
    sortOrder,
    isDefault,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

/** Staff profile; personal prices are decimal strings by service id. */
export function staffPricingProfile(
  id: string,
  priceLevelId: string | null = null,
  servicePrices: Record<string, string> = {},
): StaffPricingProfile {
  return {
    id,
    name: id,
    priceLevelId,
    servicePrices: Object.entries(servicePrices).map(([serviceId, price]) => ({
      serviceId,
      price: new Prisma.Decimal(price),
    })),
  };
}

/** The snapshot service over stubbed sources, with the sources exposed as spies. */
export function pricingSnapshotService(
  options: PricingSnapshotServiceOptions = {},
) {
  const catalog = options.catalog ?? bookingCatalogSnapshot();
  const loadCatalogSnapshot = vi.fn(async () => catalog);
  const listLevels = vi.fn(async () => options.levels ?? []);
  const listLevelPrices = vi.fn(async () => options.levelPrices ?? []);
  const listPricingProfiles = vi.fn(async () => options.staff ?? []);
  const listForSnapshot = vi.fn(async () => options.rules ?? []);
  const findPriceRoundingStep = vi.fn(
    async () => options.roundingStep ?? '1.00',
  );
  const listScheduledChanges = vi.fn(async () => options.priceChanges ?? []);
  const listPriced = vi.fn(async () => options.products ?? []);
  const getLocale = vi.fn(async () => ({
    timezone: options.timezone ?? 'UTC',
    currency: 'BYN',
  }));
  const getBookingSettings = vi.fn(async () => ({ brandId: 'brand' }));
  const cache = createTestCache(options.cacheEnabled ?? true);
  const service = new PricingSnapshotService(
    { loadCatalogSnapshot } as never,
    { listLevels, listLevelPrices } as unknown as PriceLevelReadService,
    { listForSnapshot } as never,
    { listForSnapshot: listScheduledChanges } as never,
    { listPricingProfiles } as never,
    { listPriced } as never,
    { getBookingSettings, findPriceRoundingStep, getLocale } as never,
    cache,
  );
  return {
    service,
    cache,
    loadCatalogSnapshot,
    listLevels,
    listLevelPrices,
    listPricingProfiles,
    listForSnapshot,
    findPriceRoundingStep,
    getBookingSettings,
    getLocale,
    listScheduledChanges,
  };
}
