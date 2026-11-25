import { ServicePriceChangeTarget } from '@prisma/client';
import { ServicePriceChangeGroupKind } from '../enums/service-price-change-group-kind.enum.js';
import { PriceChangeDetailGroup } from '../interfaces/price-change-detail-group.interface.js';
import { PriceChangeItemRecord } from '../interfaces/price-change-item-record.interface.js';
import { PriceChangeItemRow } from '../interfaces/price-change-item-row.interface.js';

const TARGET_ORDER: Record<ServicePriceChangeTarget, number> = {
  BASE: 0,
  LEVEL: 1,
  STAFF: 2,
  BUNDLE: 3,
};

export function toItemRow(
  item: PriceChangeItemRecord,
  current?: number | null,
): PriceChangeItemRow {
  return {
    itemId: item.id,
    targetType: item.targetType,
    levelId: item.priceLevelId,
    levelName: item.levelName,
    staffId: item.staffId,
    staffName: item.staffName,
    before: item.beforePrice,
    after: item.afterPrice,
    ...(current === undefined ? {} : { current }),
    applySkip: item.applySkip,
    rollbackSkip: item.rollbackSkip,
    rolledBack: item.rolledBack,
  };
}

/**
 * Groups stored rows by service or bundle: category (none last), title, then rows as base,
 * level (by name), personal (by name). A deleted target keeps its name as a group of its own.
 */
export function groupChangeItems(
  items: readonly PriceChangeItemRecord[],
  currents: ReadonlyMap<string, number | null> | null = null,
): PriceChangeDetailGroup[] {
  const groups = new Map<string, PriceChangeDetailGroup>();
  for (const item of items) {
    const kind =
      item.targetType === ServicePriceChangeTarget.BUNDLE
        ? ServicePriceChangeGroupKind.BUNDLE
        : ServicePriceChangeGroupKind.SERVICE;
    const id = kind === ServicePriceChangeGroupKind.BUNDLE ? item.bundleId : item.serviceId;
    const mapKey = `${kind}:${id ?? `deleted:${item.targetTitle}`}`;
    const group = groups.get(mapKey) ?? {
      kind,
      id,
      title: item.targetTitle,
      categoryName: id === null ? null : item.categoryName,
      rows: [],
    };
    group.rows.push(
      toItemRow(
        item,
        currents === null ? undefined : (currents.get(item.id) ?? null),
      ),
    );
    groups.set(mapKey, group);
  }
  const compare = (a: string, b: string) => a.localeCompare(b);
  for (const group of groups.values())
    group.rows.sort(
      (a, b) =>
        TARGET_ORDER[a.targetType] - TARGET_ORDER[b.targetType] ||
        compare(a.levelName ?? '', b.levelName ?? '') ||
        compare(a.staffName ?? '', b.staffName ?? ''),
    );
  return [...groups.values()].sort((a, b) => {
    if ((a.categoryName === null) !== (b.categoryName === null))
      return a.categoryName === null ? 1 : -1;
    return (
      compare(a.categoryName ?? '', b.categoryName ?? '') ||
      (a.kind === b.kind ? 0 : a.kind === ServicePriceChangeGroupKind.SERVICE ? -1 : 1) ||
      compare(a.title, b.title)
    );
  });
}
