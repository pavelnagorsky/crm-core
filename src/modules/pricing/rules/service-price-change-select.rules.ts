import { PriceChangeTarget } from '@prisma/client';
import { PriceChangeGroup } from '../interfaces/price-change-group.interface.js';
import { PriceChangeOverride } from '../interfaces/price-change-override.interface.js';
import { PriceChangeRow } from '../interfaces/price-change-row.interface.js';
import { PriceChangeSelectedRow } from '../interfaces/price-change-selected-row.interface.js';
import { selectChangedRows } from './price-change-select.rules.js';

/**
 * The service rows a create request asks for, over the freshly computed preview groups.
 * Only level and personal prices can be removed (null); the rest is `selectChangedRows`.
 */
export function selectPriceChangeRows(
  groups: readonly PriceChangeGroup[],
  selectedKeys: readonly string[],
  overrides: readonly PriceChangeOverride[],
): PriceChangeSelectedRow[] {
  const groupOf = new Map<PriceChangeRow, PriceChangeGroup>();
  for (const group of groups)
    for (const row of group.rows) groupOf.set(row, group);
  return selectChangedRows(
    [...groupOf.keys()],
    selectedKeys,
    overrides,
    (row) =>
      row.targetType === PriceChangeTarget.LEVEL ||
      row.targetType === PriceChangeTarget.STAFF,
  ).map(({ row, after }) => ({ group: groupOf.get(row)!, row, after }));
}
