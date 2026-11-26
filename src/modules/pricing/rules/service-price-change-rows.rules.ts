import { PriceChangeTarget } from '@prisma/client';
import { PRICE_MAX_MINOR } from '../constants/price-level-fill.constants.js';
import {
  baseKey,
  bundleKey,
  levelKey,
  PriceTimeline,
  staffKey,
} from '../engine/price-timeline.js';
import { ServicePriceChangeGroupKind } from '../enums/service-price-change-group-kind.enum.js';
import { PriceChangeMode } from '../enums/price-change-mode.enum.js';
import { PriceChangeCounts } from '../interfaces/price-change-counts.interface.js';
import { PriceChangeFacts } from '../interfaces/price-change-facts.interface.js';
import { PriceChangeGroup } from '../interfaces/price-change-group.interface.js';
import { PriceChangeRow } from '../interfaces/price-change-row.interface.js';
import { PriceChangeScopeCatalog } from '../interfaces/price-change-scope-catalog.interface.js';
import { PriceChangeSpec } from '../interfaces/price-change-spec.interface.js';
import { adjustedPrice } from './price-change-value.rules.js';

/** Ids of the services and bundles a rule applies to. */
export function selectPriceChangeScope(
  catalog: PriceChangeScopeCatalog,
  spec: PriceChangeSpec,
): { serviceIds: string[]; bundleIds: string[] } {
  const categories = new Set(spec.categoryIds);
  const services = new Set(spec.serviceIds);
  const bundles = new Set(spec.bundleIds);
  const serviceIds = catalog.services
    .filter(
      (service) =>
        spec.allServices ||
        services.has(service.id) ||
        (service.categoryId !== null && categories.has(service.categoryId)),
    )
    .map((service) => service.id);
  const bundleIds = catalog.bundles
    .filter(
      (bundle) =>
        bundle.fixed &&
        (bundles.has(bundle.id) ||
          (spec.include.fixedBundles &&
            (spec.allServices ||
              (bundle.categoryId !== null &&
                categories.has(bundle.categoryId))))),
    )
    .map((bundle) => bundle.id);
  return { serviceIds, bundleIds };
}

/**
 * The new price of one row. PERCENT and AMOUNT adjust every row; SET gives a base, bundle or
 * product price the value and leaves level and personal prices to be edited by hand. Invalid: past
 * the column maximum, or zero when the price was above zero.
 */
export function priceChangeAfter(
  target: PriceChangeTarget,
  before: number,
  spec: Pick<PriceChangeSpec, 'mode' | 'value' | 'step'>,
): { after: number; invalid: boolean } {
  let after = before;
  let overflow = false;
  if (spec.mode === PriceChangeMode.SET) {
    if (
      spec.value !== null &&
      (target === PriceChangeTarget.BASE ||
        target === PriceChangeTarget.BUNDLE ||
        target === PriceChangeTarget.PRODUCT)
    )
      after = spec.value;
  } else if (spec.value !== null) {
    ({ price: after, overflow } = adjustedPrice(
      before,
      spec.mode === PriceChangeMode.PERCENT
        ? { percentBp: spec.value }
        : { amount: spec.value },
      spec.step,
    ));
  }
  const invalid =
    overflow ||
    after > PRICE_MAX_MINOR ||
    after < 0 ||
    (after === 0 && before > 0);
  return { after, invalid };
}

type RowBase = Pick<
  PriceChangeRow,
  'key' | 'targetType' | 'levelId' | 'levelName' | 'staffId' | 'staffName'
>;

function makeRow(
  base: RowBase,
  before: number,
  spec: PriceChangeSpec,
): PriceChangeRow {
  const { after, invalid } = priceChangeAfter(base.targetType, before, spec);
  return {
    ...base,
    before,
    after,
    invalid,
    checked: !invalid && after !== before,
    replacesScheduledDate: null,
  };
}

const NO_LEVEL = { levelId: null, levelName: null };
const NO_STAFF = { staffId: null, staffName: null };

/**
 * Preview groups of a rule on a date. "Before" is the price in effect that day: the stored
 * value moved by earlier scheduled changes, so chained changes compute from each other.
 * Groups: category order (none last), services before bundles, then sort order and title.
 */
export function buildPriceChangeGroups(
  facts: PriceChangeFacts,
  spec: PriceChangeSpec,
  date: string,
  timeline: PriceTimeline,
): PriceChangeGroup[] {
  const categories = new Map(
    facts.categories.map((category) => [category.id, category]),
  );
  const levels = [...facts.levels].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  );
  const entries: { group: PriceChangeGroup; sortOrder: number }[] = [];
  const categoryOf = (categoryId: string | null) => ({
    categoryName: categories.get(categoryId ?? '')?.name ?? null,
  });
  for (const service of facts.services) {
    const rows: PriceChangeRow[] = [];
    const baseBefore = timeline.resolve(
      baseKey(service.id),
      date,
      service.price,
    );
    if (baseBefore !== null)
      rows.push(
        makeRow(
          {
            key: baseKey(service.id),
            targetType: PriceChangeTarget.BASE,
            ...NO_LEVEL,
            ...NO_STAFF,
          },
          baseBefore,
          spec,
        ),
      );
    if (spec.include.levelPrices)
      for (const level of levels) {
        const key = levelKey(service.id, level.id);
        const before = timeline.resolve(
          key,
          date,
          service.levelPrices[level.id] ?? null,
        );
        if (before === null) continue;
        rows.push(
          makeRow(
            {
              key,
              targetType: PriceChangeTarget.LEVEL,
              levelId: level.id,
              levelName: level.name,
              ...NO_STAFF,
            },
            before,
            spec,
          ),
        );
      }
    if (spec.include.staffPrices) {
      const staff = [...service.staff].sort(
        (a, b) =>
          a.name.localeCompare(b.name) || a.staffId.localeCompare(b.staffId),
      );
      for (const member of staff) {
        const key = staffKey(service.id, member.staffId);
        const before = timeline.resolve(key, date, member.price);
        if (before === null) continue;
        rows.push(
          makeRow(
            {
              key,
              targetType: PriceChangeTarget.STAFF,
              ...NO_LEVEL,
              staffId: member.staffId,
              staffName: member.name,
            },
            before,
            spec,
          ),
        );
      }
    }
    if (rows.length > 0)
      entries.push({
        group: {
          kind: ServicePriceChangeGroupKind.SERVICE,
          id: service.id,
          title: service.title,
          categoryId: service.categoryId,
          ...categoryOf(service.categoryId),
          status: service.status,
          rows,
        },
        sortOrder: service.sortOrder,
      });
  }
  for (const bundle of facts.bundles) {
    const key = bundleKey(bundle.id);
    const before = timeline.resolve(key, date, bundle.price);
    if (before === null) continue;
    entries.push({
      group: {
        kind: ServicePriceChangeGroupKind.BUNDLE,
        id: bundle.id,
        title: bundle.title,
        categoryId: bundle.categoryId,
        ...categoryOf(bundle.categoryId),
        status: bundle.status,
        rows: [
          makeRow(
            {
              key,
              targetType: PriceChangeTarget.BUNDLE,
              ...NO_LEVEL,
              ...NO_STAFF,
            },
            before,
            spec,
          ),
        ],
      },
      sortOrder: bundle.sortOrder,
    });
  }
  const kindOrder = (group: PriceChangeGroup) =>
    group.kind === ServicePriceChangeGroupKind.SERVICE ? 0 : 1;
  const categoryOrder = (group: PriceChangeGroup) =>
    categories.get(group.categoryId ?? '')?.sortOrder ?? Infinity;
  return entries
    .sort(
      (a, b) =>
        (categoryOrder(a.group) === categoryOrder(b.group)
          ? 0
          : categoryOrder(a.group) < categoryOrder(b.group)
            ? -1
            : 1) ||
        kindOrder(a.group) - kindOrder(b.group) ||
        a.sortOrder - b.sortOrder ||
        a.group.title.localeCompare(b.group.title),
    )
    .map((entry) => entry.group);
}

export function countPriceChangeRows(
  groups: readonly PriceChangeGroup[],
): PriceChangeCounts {
  const rows = groups.flatMap((group) => group.rows);
  return {
    services: groups.filter(
      (group) => group.kind === ServicePriceChangeGroupKind.SERVICE,
    ).length,
    bundles: groups.filter(
      (group) => group.kind === ServicePriceChangeGroupKind.BUNDLE,
    ).length,
    rows: rows.length,
    changed: rows.filter((row) => row.checked).length,
    invalid: rows.filter((row) => row.invalid).length,
  };
}
