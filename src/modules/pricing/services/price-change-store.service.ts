import { Injectable } from '@nestjs/common';
import {
  BundlePricingMode,
  Prisma,
  PriceChangeItem,
  PriceChangeSkip,
  PriceChangeTarget,
} from '@prisma/client';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { ProductsService } from '../../products/services/products.service.js';
import { PriceChangeItemMark } from '../interfaces/price-change-item-mark.interface.js';
import { PriceChangeTargetState } from '../interfaces/price-change-target-state.interface.js';
import { PriceChangeWrite } from '../interfaces/price-change-write.interface.js';
import { minorToApi } from '../rules/pricing-money.rules.js';

const pairKey = (a: string, b: string) => `${a}:${b}`;
const toMinor = (value: Prisma.Decimal | null) =>
  value === null ? null : MoneyUtils.toMinor(value);
const apiPrice = (price: number | null) =>
  price === null ? null : minorToApi(price);

/**
 * Reads and writes the prices a change row points at (base, level, personal, bundle, product
 * retail price) in bulk, inside the caller's transaction. A change can hold 10 000 rows, so
 * writes are single statements over a JSON list, not a query per row. Product prices go
 * through ProductsService, which owns them.
 */
@Injectable()
export class PriceChangeStore {
  constructor(private readonly products: ProductsService) {}

  /**
   * The stored price of every row's target, or why the row cannot be written. The target
   * rows are locked (FOR UPDATE) until the transaction ends, so a manual edit cannot land
   * between the decision and the write.
   */
  async loadStates(
    tx: Prisma.TransactionClient,
    items: readonly PriceChangeItem[],
  ): Promise<Map<string, PriceChangeTargetState>> {
    const states = new Map<string, PriceChangeTargetState>();
    const deleted = (id: string) =>
      states.set(id, {
        skip: PriceChangeSkip.TARGET_DELETED,
        current: null,
      });
    const of = (target: PriceChangeTarget) =>
      items.filter((item) => item.targetType === target);

    const base = of(PriceChangeTarget.BASE);
    const baseIds = base.flatMap((item) => (item.serviceId ? [item.serviceId] : []));
    const services = await tx.$queryRaw<{ id: string; price: Prisma.Decimal }[]>`
      SELECT "id", "price" FROM "Service" WHERE "id" = ANY(${baseIds}::text[])
      ORDER BY "id" FOR UPDATE`;
    const servicePrice = new Map(services.map((row) => [row.id, row.price]));
    for (const item of base) {
      const price = item.serviceId ? servicePrice.get(item.serviceId) : undefined;
      if (price === undefined) deleted(item.id);
      else states.set(item.id, { skip: null, current: toMinor(price) });
    }

    const level = of(PriceChangeTarget.LEVEL);
    const levelServiceIds = level.flatMap((item) => (item.serviceId ? [item.serviceId] : []));
    const levelIds = level.flatMap((item) => (item.priceLevelId ? [item.priceLevelId] : []));
    const levelRows = await tx.$queryRaw<
      { serviceId: string; priceLevelId: string; price: Prisma.Decimal }[]
    >`
      SELECT "serviceId", "priceLevelId", "price" FROM "ServiceLevelPrice"
      WHERE "serviceId" = ANY(${levelServiceIds}::text[])
        AND "priceLevelId" = ANY(${levelIds}::text[])
      ORDER BY "serviceId", "priceLevelId" FOR UPDATE`;
    const defaultLevels = new Set(
      (
        await tx.priceLevel.findMany({
          where: { id: { in: levelIds }, isDefault: true },
          select: { id: true },
        })
      ).map((row) => row.id),
    );
    const levelPrice = new Map(
      levelRows.map((row) => [pairKey(row.serviceId, row.priceLevelId), row.price]),
    );
    for (const item of level) {
      if (!item.serviceId || !item.priceLevelId) deleted(item.id);
      else if (defaultLevels.has(item.priceLevelId))
        // The level became the default: its price is the base price, it has no level prices.
        states.set(item.id, {
          skip: PriceChangeSkip.LEVEL_IS_DEFAULT,
          current: null,
        });
      else
        states.set(item.id, {
          skip: null,
          current: toMinor(
            levelPrice.get(pairKey(item.serviceId, item.priceLevelId)) ?? null,
          ),
        });
    }

    const staff = of(PriceChangeTarget.STAFF);
    const staffServiceIds = staff.flatMap((item) => (item.serviceId ? [item.serviceId] : []));
    const staffIds = staff.flatMap((item) => (item.staffId ? [item.staffId] : []));
    const staffRows = await tx.$queryRaw<
      { serviceId: string; staffId: string; price: Prisma.Decimal | null }[]
    >`
      SELECT "serviceId", "staffId", "price" FROM "StaffService"
      WHERE "serviceId" = ANY(${staffServiceIds}::text[])
        AND "staffId" = ANY(${staffIds}::text[])
      ORDER BY "serviceId", "staffId" FOR UPDATE`;
    const staffPrice = new Map(
      staffRows.map((row) => [pairKey(row.serviceId, row.staffId), row.price]),
    );
    for (const item of staff) {
      if (!item.serviceId || !item.staffId) {
        deleted(item.id);
        continue;
      }
      const key = pairKey(item.serviceId, item.staffId);
      if (!staffPrice.has(key))
        states.set(item.id, {
          skip: PriceChangeSkip.STAFF_NOT_ASSIGNED,
          current: null,
        });
      else
        states.set(item.id, { skip: null, current: toMinor(staffPrice.get(key)!) });
    }

    const bundle = of(PriceChangeTarget.BUNDLE);
    const bundleIds = bundle.flatMap((item) => (item.bundleId ? [item.bundleId] : []));
    const bundles = await tx.$queryRaw<
      { id: string; pricingMode: string; fixedPrice: Prisma.Decimal | null }[]
    >`
      SELECT "id", "pricingMode"::text AS "pricingMode", "fixedPrice" FROM "ServiceBundle"
      WHERE "id" = ANY(${bundleIds}::text[]) ORDER BY "id" FOR UPDATE`;
    const bundleById = new Map(bundles.map((row) => [row.id, row]));
    for (const item of bundle) {
      const row = item.bundleId ? bundleById.get(item.bundleId) : undefined;
      if (!row) deleted(item.id);
      else if (row.pricingMode !== BundlePricingMode.FIXED)
        states.set(item.id, {
          skip: PriceChangeSkip.BUNDLE_NOT_FIXED,
          current: null,
        });
      else states.set(item.id, { skip: null, current: toMinor(row.fixedPrice) });
    }

    const product = of(PriceChangeTarget.PRODUCT);
    const refs = await this.products.lockLocationRefs(
      tx,
      product.flatMap((item) =>
        item.productLocationId ? [item.productLocationId] : [],
      ),
    );
    const refById = new Map(refs.map((ref) => [ref.productLocationId, ref]));
    for (const item of product) {
      const ref = item.productLocationId
        ? refById.get(item.productLocationId)
        : undefined;
      if (!ref) deleted(item.id);
      else if (ref.retailPrice === null || !ref.isForSale)
        states.set(item.id, {
          skip: PriceChangeSkip.NOT_FOR_SALE,
          current: null,
        });
      else states.set(item.id, { skip: null, current: toMinor(ref.retailPrice) });
    }
    return states;
  }

  /** Writes the prices; the rows must be ones `loadStates` found writable. */
  async writePrices(
    tx: Prisma.TransactionClient,
    items: ReadonlyMap<string, PriceChangeItem>,
    writes: readonly PriceChangeWrite[],
  ): Promise<void> {
    const pick = (target: PriceChangeTarget) =>
      writes.flatMap((write) => {
        const item = items.get(write.itemId);
        return item?.targetType === target ? [{ item, price: write.price }] : [];
      });
    const base = pick(PriceChangeTarget.BASE);
    if (base.length > 0) {
      const json = JSON.stringify(
        base.map(({ item, price }) => ({ a: item.serviceId, p: apiPrice(price) })),
      );
      await tx.$executeRaw`UPDATE "Service" AS t SET "price" = v.p, "updatedAt" = now()
        FROM jsonb_to_recordset(${json}::jsonb) AS v(a text, p numeric) WHERE t."id" = v.a`;
    }
    const level = pick(PriceChangeTarget.LEVEL);
    const removed = level.filter(({ price }) => price === null);
    const set = level.filter(({ price }) => price !== null);
    if (removed.length > 0) {
      const json = JSON.stringify(
        removed.map(({ item }) => ({ a: item.serviceId, b: item.priceLevelId })),
      );
      await tx.$executeRaw`DELETE FROM "ServiceLevelPrice" AS t
        USING jsonb_to_recordset(${json}::jsonb) AS v(a text, b text)
        WHERE t."serviceId" = v.a AND t."priceLevelId" = v.b`;
    }
    if (set.length > 0) {
      const json = JSON.stringify(
        set.map(({ item, price }) => ({
          a: item.serviceId,
          b: item.priceLevelId,
          p: apiPrice(price),
        })),
      );
      await tx.$executeRaw`INSERT INTO "ServiceLevelPrice" ("serviceId", "priceLevelId", "price")
        SELECT v.a, v.b, v.p FROM jsonb_to_recordset(${json}::jsonb) AS v(a text, b text, p numeric)
        ON CONFLICT ("serviceId", "priceLevelId") DO UPDATE SET "price" = EXCLUDED."price"`;
    }
    const staff = pick(PriceChangeTarget.STAFF);
    if (staff.length > 0) {
      const json = JSON.stringify(
        staff.map(({ item, price }) => ({
          a: item.serviceId,
          b: item.staffId,
          p: apiPrice(price),
        })),
      );
      await tx.$executeRaw`UPDATE "StaffService" AS t SET "price" = v.p
        FROM jsonb_to_recordset(${json}::jsonb) AS v(a text, b text, p numeric)
        WHERE t."serviceId" = v.a AND t."staffId" = v.b`;
    }
    const bundle = pick(PriceChangeTarget.BUNDLE);
    if (bundle.length > 0) {
      const json = JSON.stringify(
        bundle.map(({ item, price }) => ({ a: item.bundleId, p: apiPrice(price) })),
      );
      await tx.$executeRaw`UPDATE "ServiceBundle" AS t SET "fixedPrice" = v.p, "updatedAt" = now()
        FROM jsonb_to_recordset(${json}::jsonb) AS v(a text, p numeric) WHERE t."id" = v.a`;
    }
    await this.products.setRetailPrices(
      tx,
      pick(PriceChangeTarget.PRODUCT).flatMap(({ item, price }) =>
        item.productLocationId && price !== null
          ? [
              {
                productLocationId: item.productLocationId,
                retailPrice: MoneyUtils.fromMinor(price),
              },
            ]
          : [],
      ),
    );
  }

  /** Stores "before" and the skip reason on the rows of an applied change. */
  async markApplied(
    tx: Prisma.TransactionClient,
    marks: readonly PriceChangeItemMark[],
  ): Promise<void> {
    if (marks.length === 0) return;
    const json = JSON.stringify(
      marks.map((mark) => ({
        a: mark.itemId,
        b: apiPrice(mark.before),
        s: mark.skip,
      })),
    );
    await tx.$executeRaw`UPDATE "PriceChangeItem" AS t
      SET "beforePrice" = CASE WHEN v.s IS NULL THEN v.b ELSE t."beforePrice" END,
          "applySkip" = v.s::"PriceChangeSkip"
      FROM jsonb_to_recordset(${json}::jsonb) AS v(a text, b numeric, s text)
      WHERE t."id" = v.a`;
  }

  /** Stores the rollback result on the rows. */
  async markRolledBack(
    tx: Prisma.TransactionClient,
    marks: readonly PriceChangeItemMark[],
  ): Promise<void> {
    if (marks.length === 0) return;
    const json = JSON.stringify(
      marks.map((mark) => ({
        a: mark.itemId,
        r: mark.rolledBack,
        s: mark.skip,
      })),
    );
    await tx.$executeRaw`UPDATE "PriceChangeItem" AS t
      SET "rolledBack" = v.r, "rollbackSkip" = v.s::"PriceChangeSkip"
      FROM jsonb_to_recordset(${json}::jsonb) AS v(a text, r boolean, s text)
      WHERE t."id" = v.a`;
  }
}
