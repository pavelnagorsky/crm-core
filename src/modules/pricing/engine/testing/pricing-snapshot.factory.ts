import { BundlePricingMode } from '../enums/bundle-pricing-mode.enum.js';
import { PricingBundleEntry } from '../interfaces/pricing-bundle-entry.interface.js';
import { PricingLevelEntry } from '../interfaces/pricing-level-entry.interface.js';
import { PricingSnapshot } from '../interfaces/pricing-snapshot.interface.js';
import { PricingStaffEntry } from '../interfaces/pricing-staff-entry.interface.js';
import { QuoteLineRequest } from '../interfaces/quote-line-request.interface.js';
import { PricingSnapshotOptions } from './interfaces/pricing-snapshot-options.interface.js';

/** Catalog prices in minor units: cut 60.00, color 90.00, wash 15.00. */
export const DEFAULT_SERVICE_PRICES: Readonly<Record<string, number>> = {
  cut: 6000,
  color: 9000,
  wash: 1500,
};

export function pricingSnapshot(
  options: PricingSnapshotOptions = {},
): PricingSnapshot {
  const services = options.services ?? DEFAULT_SERVICE_PRICES;
  return {
    services: Object.entries(services).map(([id, price]) => ({
      id,
      price,
      levelPrices: options.levelPrices?.[id] ?? {},
    })),
    bundles: options.bundles ?? [
      sumBundle('sum-bundle'),
      fixedBundle('fixed-bundle', 12000),
    ],
    levels: options.levels ?? [],
    staff: options.staff ?? [],
  };
}

export function priceLevel(
  id: string,
  name: string,
  isDefault = false,
): PricingLevelEntry {
  return { id, name, isDefault };
}

export function pricingStaff(
  id: string,
  levelId: string | null = null,
  servicePrices: Record<string, number> = {},
  name = id,
): PricingStaffEntry {
  return { id, name, levelId, servicePrices };
}

export function sumBundle(
  id: string,
  serviceIds: string[] = ['cut', 'color'],
): PricingBundleEntry {
  return {
    id,
    pricingMode: BundlePricingMode.SUM,
    fixedPrice: null,
    serviceIds,
  };
}

export function fixedBundle(
  id: string,
  fixedPrice: number | null,
  serviceIds: string[] = ['cut', 'color'],
): PricingBundleEntry {
  return { id, pricingMode: BundlePricingMode.FIXED, fixedPrice, serviceIds };
}

export function quoteLine(
  serviceId: string,
  customPrice: number | null = null,
  staffId: string | null = 'anna',
): QuoteLineRequest {
  return { serviceId, staffId, customPrice };
}
