import { BundlePricingMode } from '../enums/bundle-pricing-mode.enum.js';
import { ProductUnit } from '../enums/product-unit.enum.js';
import { PricingProductEntry } from '../interfaces/pricing-product-entry.interface.js';
import { PriceRuleKind } from '../enums/price-rule-kind.enum.js';
import { PriceScheduleType } from '../enums/price-schedule-type.enum.js';
import { PriceValueType } from '../enums/price-value-type.enum.js';
import { PromotionChannel } from '../enums/promotion-channel.enum.js';
import { PromotionClientFilter } from '../enums/promotion-client-filter.enum.js';
import { PricingPromotionEntry } from '../interfaces/pricing-promotion-entry.interface.js';
import { QuoteContext } from '../interfaces/quote-context.interface.js';
import { PricingBundleEntry } from '../interfaces/pricing-bundle-entry.interface.js';
import { PricingLevelEntry } from '../interfaces/pricing-level-entry.interface.js';
import { PricingRuleEntry } from '../interfaces/pricing-rule-entry.interface.js';
import { PricingSnapshot } from '../interfaces/pricing-snapshot.interface.js';
import { PricingStaffEntry } from '../interfaces/pricing-staff-entry.interface.js';
import { QuoteLineRequest } from '../interfaces/quote-line-request.interface.js';
import { VisitTime } from '../interfaces/visit-time.interface.js';
import { PricingSnapshotOptions } from './interfaces/pricing-snapshot-options.interface.js';

/** Catalog prices in minor units: cut 60.00, color 90.00, wash 15.00. */
export const DEFAULT_SERVICE_PRICES: Readonly<Record<string, number>> = {
  cut: 6000,
  color: 9000,
  wash: 1500,
};

/** The location day the engine specs treat as today. */
export const PRICING_TODAY = '2026-11-25';

export function pricingSnapshot(
  options: PricingSnapshotOptions = {},
): PricingSnapshot {
  const services = options.services ?? DEFAULT_SERVICE_PRICES;
  return {
    services: Object.entries(services).map(([id, price]) => ({
      id,
      categoryId: options.categories?.[id] ?? null,
      price,
      levelPrices: options.levelPrices?.[id] ?? {},
    })),
    bundles: options.bundles ?? [
      sumBundle('sum-bundle'),
      fixedBundle('fixed-bundle', 12000),
    ],
    levels: options.levels ?? [],
    staff: options.staff ?? [],
    rules: options.rules ?? [],
    roundingStep: options.roundingStep ?? 100,
    timezone: options.timezone ?? 'UTC',
    priceChanges: options.priceChanges ?? [],
    products: options.products ?? [],
  };
}

/** A product the location sells: row id `pl-<productId>`, PIECE, no category by default. */
export function pricingProduct(
  productId: string,
  retailPrice: number,
  overrides: Partial<PricingProductEntry> = {},
): PricingProductEntry {
  return {
    productLocationId: `pl-${productId}`,
    productId,
    categoryId: null,
    unit: ProductUnit.PIECE,
    retailPrice,
    ...overrides,
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

/**
 * Enabled WEEKLY surcharge of +10% on every service, every day, the whole day; override
 * any field. Equal createdAt: display order falls back to the id.
 */
export function surchargeRule(
  id: string,
  overrides: Partial<PricingRuleEntry> = {},
): PricingRuleEntry {
  return {
    id,
    kind: PriceRuleKind.SURCHARGE,
    name: id,
    scheduleType: PriceScheduleType.WEEKLY,
    enabled: true,
    valueType: PriceValueType.PERCENT,
    value: 1000,
    visitFrom: null,
    visitTo: null,
    yearly: false,
    holidayExclusive: false,
    weekdaysMask: 0,
    intervals: [],
    dates: [],
    appliesToAllServices: true,
    appliesToAllProducts: false,
    targets: [],
    promotion: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * Enabled promotion of -10% on every service, every day, the whole day, both channels,
 * any client, no code or limits; override rule fields and promotion conditions.
 */
export function promotionRule(
  id: string,
  overrides: Partial<PricingRuleEntry> = {},
  conditions: Partial<PricingPromotionEntry> = {},
): PricingRuleEntry {
  return surchargeRule(id, {
    kind: PriceRuleKind.PROMOTION,
    promotion: {
      publicName: `Акция ${id}`,
      showAsPromotion: true,
      bookingFrom: null,
      bookingTo: null,
      minLeadMinutes: null,
      maxLeadMinutes: null,
      channels: [PromotionChannel.ONLINE, PromotionChannel.ADMIN],
      staffIds: [],
      clientFilter: PromotionClientFilter.ANY,
      birthdayWindowDays: null,
      promoCode: null,
      usageLimitTotal: null,
      usageLimitPerClient: null,
      usageLimitPeriod: null,
      minVisitTotal: null,
      ...conditions,
    },
    ...overrides,
  });
}

/**
 * Online context of an unknown client, priced at 2026-11-23 09:00 UTC (location today
 * 2026-11-23), the visit start unknown; override any field.
 */
export function quoteContext(overrides: Partial<QuoteContext> = {}): QuoteContext {
  return {
    channel: PromotionChannel.ONLINE,
    nowMs: Date.UTC(2026, 10, 23, 9, 0),
    today: '2026-11-23',
    visitStartMs: null,
    client: {
      known: false,
      isNew: false,
      birthday: null,
      servicesDiscountBp: null,
      productsDiscountBp: null,
    },
    promoCode: null,
    usage: {},
    ...overrides,
  };
}

/** Weekday mask from ISO weekdays (1 = Monday ... 7 = Sunday). */
export function weekdays(...isoWeekdays: number[]): number {
  return isoWeekdays.reduce((mask, day) => mask | (1 << (day - 1)), 0);
}

/** Minute of the day from HH:mm. */
export function minuteOf(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function visitAt(date: string, time: string): VisitTime {
  return { date, minute: minuteOf(time) };
}
