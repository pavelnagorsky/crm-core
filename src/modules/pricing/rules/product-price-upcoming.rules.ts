import { ProductPriceUpcomingSource } from '../interfaces/product-price-upcoming-source.interface.js';
import { ProductPriceUpcomingView } from '../interfaces/product-price-upcoming-view.interface.js';

/**
 * Hints about scheduled product prices. `next`: the nearest date with how many changes and
 * products it has. Changes dated on or before `today` (the location day) are in force
 * already and are no hints. `products`: the nearest scheduled price of each product the
 * location sells (`current`: Product.id and the stored price by ProductLocation.id), left
 * out when it equals the current one. `changes` come ordered by date, then creation.
 */
export function buildProductUpcoming(
  allChanges: readonly ProductPriceUpcomingSource[],
  current: ReadonlyMap<string, { productId: string; price: number }>,
  today: string,
): ProductPriceUpcomingView {
  const changes = allChanges.filter((change) => change.effectiveDate > today);
  const first = changes[0];
  let next: ProductPriceUpcomingView['next'] = null;
  if (first) {
    const onDate = changes.filter(
      (change) => change.effectiveDate === first.effectiveDate,
    );
    const ids = onDate.flatMap((change) =>
      change.items.flatMap((item) =>
        item.productLocationId ? [item.productLocationId] : [],
      ),
    );
    next = {
      effectiveDate: first.effectiveDate,
      changeIds: onDate.map((change) => change.id),
      changesCount: onDate.length,
      productsCount: new Set(ids).size,
    };
  }
  const nearest = new Map<
    string,
    { changeId: string; effectiveDate: string; price: number }
  >();
  for (const change of changes)
    for (const item of change.items)
      if (
        item.productLocationId &&
        item.afterPrice !== null &&
        !nearest.has(item.productLocationId)
      )
        nearest.set(item.productLocationId, {
          changeId: change.id,
          effectiveDate: change.effectiveDate,
          price: item.afterPrice,
        });
  return {
    next,
    products: [...nearest].flatMap(([productLocationId, entry]) => {
      const now = current.get(productLocationId);
      return now && now.price !== entry.price
        ? [{ productId: now.productId, ...entry }]
        : [];
    }),
  };
}
