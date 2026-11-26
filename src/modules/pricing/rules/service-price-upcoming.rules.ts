import { PriceChangeTarget } from '@prisma/client';
import { PriceChangeUpcomingSource } from '../interfaces/price-change-upcoming-source.interface.js';
import { ServicePriceUpcomingView } from '../interfaces/service-price-upcoming-view.interface.js';

/**
 * Hints about scheduled prices. `next`: the nearest date among the changes with how many
 * changes, services and bundles it has. Changes dated on or before `today` (the location
 * day) are no hints: they are in force already, the job only has not stored them yet. `services` / `bundles`: the
 * nearest scheduled base / bundle price of each, left out when it equals the current one.
 * `changes` come ordered by date, then creation.
 */
export function buildUpcoming(
  allChanges: readonly PriceChangeUpcomingSource[],
  currentServices: ReadonlyMap<string, number>,
  currentBundles: ReadonlyMap<string, number>,
  today: string,
): ServicePriceUpcomingView {
  const changes = allChanges.filter((change) => change.effectiveDate > today);
  const first = changes[0];
  let next: ServicePriceUpcomingView['next'] = null;
  if (first) {
    const onDate = changes.filter(
      (change) => change.effectiveDate === first.effectiveDate,
    );
    const items = onDate.flatMap((change) => change.items);
    next = {
      effectiveDate: first.effectiveDate,
      changeIds: onDate.map((change) => change.id),
      changesCount: onDate.length,
      servicesCount: new Set(items.flatMap((i) => (i.serviceId ? [i.serviceId] : []))).size,
      bundlesCount: new Set(items.flatMap((i) => (i.bundleId ? [i.bundleId] : []))).size,
    };
  }
  const services = new Map<string, { changeId: string; effectiveDate: string; price: number }>();
  const bundles = new Map<string, { changeId: string; effectiveDate: string; price: number }>();
  for (const change of changes)
    for (const item of change.items) {
      if (item.afterPrice === null) continue;
      const entry = {
        changeId: change.id,
        effectiveDate: change.effectiveDate,
        price: item.afterPrice,
      };
      if (item.targetType === PriceChangeTarget.BASE && item.serviceId) {
        if (!services.has(item.serviceId)) services.set(item.serviceId, entry);
      } else if (
        item.targetType === PriceChangeTarget.BUNDLE &&
        item.bundleId &&
        !bundles.has(item.bundleId)
      )
        bundles.set(item.bundleId, entry);
    }
  return {
    next,
    services: [...services]
      .filter(([id, entry]) => currentServices.get(id) !== entry.price)
      .map(([serviceId, entry]) => ({ serviceId, ...entry })),
    bundles: [...bundles]
      .filter(([id, entry]) => currentBundles.get(id) !== entry.price)
      .map(([bundleId, entry]) => ({ bundleId, ...entry })),
  };
}
