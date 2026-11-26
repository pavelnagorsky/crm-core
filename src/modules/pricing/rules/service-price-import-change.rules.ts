import { PriceChangeTarget } from '@prisma/client';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import {
  baseKey,
  bundleKey,
  levelKey,
  staffKey,
} from '../engine/price-timeline.js';
import { ServicePriceChangeGroupKind } from '../enums/service-price-change-group-kind.enum.js';
import { ServicePriceImportItemType } from '../enums/service-price-import-item-type.enum.js';
import { PriceChangeGroup } from '../interfaces/price-change-group.interface.js';
import { PriceChangeRow } from '../interfaces/price-change-row.interface.js';
import { PriceChangeItemDraft } from '../interfaces/price-change-item-draft.interface.js';
import { ServicePriceImportCatalog } from '../interfaces/service-price-import-catalog.interface.js';
import { ServicePriceImportChange } from '../interfaces/service-price-import-change.interface.js';
import { ServicePriceImportFacts } from '../interfaces/service-price-import-facts.interface.js';
import { ServicePriceImportPlan } from '../interfaces/service-price-import-plan.interface.js';
import { normalizeName, serviceKey } from './service-price-import.rules.js';

/** What the rows of the file are checked against, from the stored catalog. */
export function buildImportCatalog(
  facts: ServicePriceImportFacts,
): ServicePriceImportCatalog {
  const categoryName = new Map(
    facts.catalog.categories.map((category) => [category.id, category.name]),
  );
  const items = new Map<
    string,
    { type: ServicePriceImportItemType; fixed: boolean }
  >();
  for (const service of facts.catalog.services)
    items.set(service.id, {
      type: ServicePriceImportItemType.SERVICE,
      fixed: false,
    });
  for (const bundle of facts.catalog.bundles)
    items.set(bundle.id, {
      type: ServicePriceImportItemType.BUNDLE,
      fixed: bundle.pricingMode === 'FIXED' && bundle.fixedPrice !== null,
    });
  return {
    items,
    serviceKeys: new Set(
      facts.catalog.services.map((service) =>
        serviceKey(
          service.categoryId ? (categoryName.get(service.categoryId) ?? null) : null,
          service.title,
        ),
      ),
    ),
    categories: new Map(
      facts.catalog.categories.map((category) => [
        normalizeName(category.name),
        category.name,
      ]),
    ),
    levels: facts.levels.map((level) => ({
      id: level.id,
      name: level.name,
      isDefault: level.isDefault,
    })),
    staffIds: new Set(facts.assignments.map((row) => row.staffId)),
    assignments: new Set(
      facts.assignments.map((row) => `${row.staffId}:${row.serviceId}`),
    ),
  };
}

const minor = (value: { toFixed(places: number): string } | string | null) =>
  value === null ? null : MoneyUtils.toMinor(value as string);

/**
 * The price changes a file makes on the date: "before" is the price in force that day (stored
 * price plus the scheduled changes up to it), "after" comes from the file. Equal prices give
 * no row. A row whose "before" comes from a scheduled change carries its date
 * (`replacesScheduledDate`). Rows are grouped by service or bundle in the order of the file.
 */
export function buildImportChange(
  plan: ServicePriceImportPlan,
  facts: ServicePriceImportFacts,
): ServicePriceImportChange {
  const { timeline, date } = facts;
  const services = new Map(facts.catalog.services.map((s) => [s.id, s]));
  const bundles = new Map(facts.catalog.bundles.map((b) => [b.id, b]));
  const categoryName = new Map(
    facts.catalog.categories.map((c) => [c.id, c.name]),
  );
  const levelName = new Map(facts.levels.map((l) => [l.id, l.name]));
  const levelPrice = new Map(
    facts.levelPrices.map((row) => [
      `${row.serviceId}:${row.priceLevelId}`,
      row.price,
    ]),
  );
  const staffPrice = new Map(
    facts.assignments.map((row) => [`${row.staffId}:${row.serviceId}`, row]),
  );

  const groups = new Map<string, PriceChangeGroup>();
  const drafts: PriceChangeItemDraft[] = [];

  const push = (
    id: string,
    kind: ServicePriceChangeGroupKind,
    row: Omit<
      PriceChangeRow,
      'invalid' | 'checked' | 'before' | 'replacesScheduledDate'
    > & {
      current: number | null;
    },
  ) => {
    const before = timeline.resolve(row.key, date, row.current);
    if (before === row.after) return;
    const group = groups.get(id) ?? newGroup(id, kind);
    groups.set(id, group);
    const { current: _current, ...rest } = row;
    group.rows.push({
      ...rest,
      before,
      invalid: false,
      checked: true,
      replacesScheduledDate: timeline.sourceDate(row.key, date),
    });
    const isBundle = kind === ServicePriceChangeGroupKind.BUNDLE;
    drafts.push({
      targetType: row.targetType,
      serviceId: isBundle ? null : id,
      priceLevelId: row.levelId,
      staffId: row.staffId,
      bundleId: isBundle ? id : null,
      productLocationId: null,
      targetTitle: group.title,
      levelName: row.levelName,
      staffName: row.staffName,
      beforePrice: before === null ? null : MoneyUtils.fromMinor(before),
      afterPrice: row.after === null ? null : MoneyUtils.fromMinor(row.after),
    });
  };

  const newGroup = (
    id: string,
    kind: ServicePriceChangeGroupKind,
  ): PriceChangeGroup => {
    const item =
      kind === ServicePriceChangeGroupKind.BUNDLE
        ? bundles.get(id)!
        : services.get(id)!;
    return {
      kind,
      id,
      title: item.title,
      categoryId: item.categoryId,
      categoryName: item.categoryId
        ? (categoryName.get(item.categoryId) ?? null)
        : null,
      status: item.status,
      rows: [],
    };
  };

  const target = (type: PriceChangeTarget) => ({
    targetType: type,
    levelId: null,
    levelName: null,
    staffId: null,
    staffName: null,
  });

  for (const edit of plan.edits) {
    if (edit.type === ServicePriceImportItemType.BUNDLE) {
      const bundle = bundles.get(edit.id)!;
      if (edit.basePrice !== null)
        push(edit.id, ServicePriceChangeGroupKind.BUNDLE, {
          ...target(PriceChangeTarget.BUNDLE),
          key: bundleKey(edit.id),
          current: minor(bundle.fixedPrice?.toFixed(2) ?? null),
          after: minor(edit.basePrice),
        });
      continue;
    }
    const service = services.get(edit.id)!;
    if (edit.basePrice !== null)
      push(edit.id, ServicePriceChangeGroupKind.SERVICE, {
        ...target(PriceChangeTarget.BASE),
        key: baseKey(edit.id),
        current: minor(service.price.toFixed(2)),
        after: minor(edit.basePrice),
      });
    for (const level of edit.levelPrices) {
      const stored = levelPrice.get(`${edit.id}:${level.levelId}`);
      push(edit.id, ServicePriceChangeGroupKind.SERVICE, {
        ...target(PriceChangeTarget.LEVEL),
        levelId: level.levelId,
        levelName: levelName.get(level.levelId) ?? null,
        key: levelKey(edit.id, level.levelId),
        current: minor(stored?.toFixed(2) ?? null),
        after: minor(level.price),
      });
    }
  }
  for (const edit of plan.staffEdits) {
    const assignment = staffPrice.get(`${edit.staffId}:${edit.serviceId}`)!;
    push(edit.serviceId, ServicePriceChangeGroupKind.SERVICE, {
      ...target(PriceChangeTarget.STAFF),
      staffId: edit.staffId,
      staffName: assignment.staffName,
      key: staffKey(edit.serviceId, edit.staffId),
      current: minor(assignment.price?.toFixed(2) ?? null),
      after: minor(edit.price),
    });
  }

  const list = [...groups.values()];
  return {
    groups: list,
    drafts,
    serviceIds: list
      .filter((group) => group.kind === ServicePriceChangeGroupKind.SERVICE)
      .map((group) => group.id),
    bundleIds: list
      .filter((group) => group.kind === ServicePriceChangeGroupKind.BUNDLE)
      .map((group) => group.id),
  };
}
