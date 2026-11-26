import { PriceChangeTarget } from './enums/price-change-target.enum.js';
import { PriceTimelinePoint } from './interfaces/price-timeline-point.interface.js';
import { PricingPriceChangeEntry } from './interfaces/pricing-price-change-entry.interface.js';
import { PricingPriceChangeItem } from './interfaces/pricing-price-change-item.interface.js';

/** Key of the base price of a service. */
export const baseKey = (serviceId: string): string => `BASE:${serviceId}`;
/** Key of the price of a service on a price level. */
export const levelKey = (serviceId: string, levelId: string): string =>
  `LEVEL:${serviceId}:${levelId}`;
/** Key of the personal price of a staff member for a service. */
export const staffKey = (serviceId: string, staffId: string): string =>
  `STAFF:${serviceId}:${staffId}`;
/** Key of the fixed price of a bundle. */
export const bundleKey = (bundleId: string): string => `BUNDLE:${bundleId}`;
/** Key of the retail price of a product in a location. */
export const productKey = (productLocationId: string): string =>
  `PRODUCT:${productLocationId}`;

/** Key of a change row, or null when its target reference is gone. */
export function priceChangeItemKey(
  item: PricingPriceChangeItem,
): string | null {
  switch (item.target) {
    case PriceChangeTarget.BASE:
      return item.serviceId ? baseKey(item.serviceId) : null;
    case PriceChangeTarget.LEVEL:
      return item.serviceId && item.levelId
        ? levelKey(item.serviceId, item.levelId)
        : null;
    case PriceChangeTarget.STAFF:
      return item.serviceId && item.staffId
        ? staffKey(item.serviceId, item.staffId)
        : null;
    case PriceChangeTarget.BUNDLE:
      return item.bundleId ? bundleKey(item.bundleId) : null;
    case PriceChangeTarget.PRODUCT:
      return item.productLocationId
        ? productKey(item.productLocationId)
        : null;
  }
}

/**
 * Prices that start on a date, per target. Pure data, no clock: the caller passes the date.
 * `resolve` returns the price of the last change dated on or before the day, else the
 * current stored value.
 */
export class PriceTimeline {
  private readonly points = new Map<string, PriceTimelinePoint[]>();

  /** Changes in any order: points are sorted by date, ties keep the input order. */
  constructor(changes: readonly PricingPriceChangeEntry[]) {
    for (const change of changes) {
      for (const item of change.items) {
        const key = priceChangeItemKey(item);
        if (key === null) continue;
        const list = this.points.get(key) ?? [];
        list.push({ date: change.effectiveDate, price: item.price });
        this.points.set(key, list);
      }
    }
    for (const list of this.points.values())
      list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  /** True when there are no dated changes at all. */
  get isEmpty(): boolean {
    return this.points.size === 0;
  }

  /** True when the target has at least one dated change. */
  has(key: string): boolean {
    return this.points.has(key);
  }

  /** Price on the local date (YYYY-MM-DD): the last change on or before it, else current. */
  resolve(key: string, date: string, current: number | null): number | null {
    const list = this.points.get(key);
    if (!list) return current;
    let result = current;
    for (const point of list) {
      if (point.date > date) break;
      result = point.price;
    }
    return result;
  }

  /** Date of the last change on or before the local date; null when the price there is the stored one. */
  sourceDate(key: string, date: string): string | null {
    const list = this.points.get(key);
    if (!list) return null;
    let result: string | null = null;
    for (const point of list) {
      if (point.date > date) break;
      result = point.date;
    }
    return result;
  }

  /** Dates of the target's changes strictly after `from` and not after `to`, ascending. */
  changeDates(key: string, from: string, to: string): string[] {
    const list = this.points.get(key);
    if (!list) return [];
    const dates = list
      .map((point) => point.date)
      .filter((date) => date > from && date <= to);
    return [...new Set(dates)];
  }
}
