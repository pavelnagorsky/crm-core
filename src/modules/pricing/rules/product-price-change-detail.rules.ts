import { PriceChangeItem } from '@prisma/client';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { LocationProductRef } from '../../products/interfaces/location-product-ref.interface.js';
import { ProductPriceChangeItemRow } from '../interfaces/product-price-change-item-row.interface.js';

/**
 * The rows of a stored product change: the name as stored, the current product, SKU and
 * category (none when the product row is gone), sorted by category (none last), then name.
 * `currents` (rollback) adds the price each row had before the rollback.
 */
export function productChangeItemRows(
  items: readonly PriceChangeItem[],
  refs: ReadonlyMap<string, LocationProductRef>,
  currents: ReadonlyMap<string, number | null> | null = null,
): ProductPriceChangeItemRow[] {
  const compare = (a: string, b: string) => a.localeCompare(b, 'ru');
  return items
    .map((item): ProductPriceChangeItemRow => {
      const ref = item.productLocationId
        ? refs.get(item.productLocationId)
        : undefined;
      return {
        itemId: item.id,
        productId: ref?.productId ?? null,
        productLocationId: ref ? item.productLocationId : null,
        title: item.targetTitle,
        sku: ref?.sku ?? null,
        categoryName: ref?.categoryName ?? null,
        // Product rows are always written with both prices ("after" has a DB CHECK).
        before: item.beforePrice === null ? 0 : MoneyUtils.toMinor(item.beforePrice),
        after: item.afterPrice === null ? 0 : MoneyUtils.toMinor(item.afterPrice),
        ...(currents === null ? {} : { current: currents.get(item.id) ?? null }),
        applySkip: item.applySkip,
        rollbackSkip: item.rollbackSkip,
        rolledBack: item.rolledBack,
      };
    })
    .sort((a, b) => {
      if ((a.categoryName === null) !== (b.categoryName === null))
        return a.categoryName === null ? 1 : -1;
      return (
        compare(a.categoryName ?? '', b.categoryName ?? '') ||
        compare(a.title, b.title)
      );
    });
}
