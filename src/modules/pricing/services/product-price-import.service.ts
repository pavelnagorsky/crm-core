import { HttpStatus, Injectable } from '@nestjs/common';
import {
  Prisma,
  PriceChangeCatalog,
  PriceChangeSource,
  PriceChangeTarget,
} from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { InventoryFacade } from '../../inventory/inventory.facade.js';
import { LocationService } from '../../location/services/location.service.js';
import { ProductsService } from '../../products/services/products.service.js';
import {
  PRICE_CHANGE_MAX_ITEMS,
  PRICE_CHANGE_TX_TIMEOUT_MS,
} from '../constants/price-change.constants.js';
import { PRODUCT_PRICE_IMPORT_MAX_LISTED_ERRORS } from '../constants/product-price-import.constants.js';
import { PriceTimeline } from '../engine/price-timeline.js';
import { ServicePriceImportFileReason } from '../enums/service-price-import-file-reason.enum.js';
import { PriceChangeItemDraft } from '../interfaces/price-change-item-draft.interface.js';
import { ProductPriceChangeRow } from '../interfaces/product-price-change-row.interface.js';
import { ProductPriceImportPlan } from '../interfaces/product-price-import-plan.interface.js';
import { ProductPriceImportPreview } from '../interfaces/product-price-import-preview.interface.js';
import { ProductPriceImportResult } from '../interfaces/product-price-import-result.interface.js';
import { ProductPriceSheet } from '../interfaces/product-price-sheet.interface.js';
import { ServicePriceImportUpload } from '../interfaces/service-price-import-upload.interface.js';
import { parseImportEffectiveDate } from '../rules/price-import-date.rules.js';
import {
  buildProductImportRows,
  planProductPriceImport,
} from '../rules/product-price-import.rules.js';
import { PriceChangeApplier } from './price-change-applier.service.js';
import { PriceChangeHistoryService } from './price-change-history.service.js';
import { PriceChangeLock } from './price-change-lock.service.js';
import { PriceChangeWriter } from './price-change-writer.service.js';
import { ProductPriceSheetService } from './product-price-sheet.service.js';
import { ScheduledPriceChangeReadService } from './scheduled-price-change-read.service.js';

type Loaded = {
  date: string;
  plan: ProductPriceImportPlan;
  rows: ProductPriceChangeRow[];
};

/**
 * Product price file upload: the preview without writes and the import under the location
 * lock. The upload changes retail prices of existing products only; it never creates
 * products.
 */
@Injectable()
export class ProductPriceImportService {
  constructor(
    private readonly db: DatabaseService,
    private readonly sheets: ProductPriceSheetService,
    private readonly products: ProductsService,
    private readonly inventory: InventoryFacade,
    private readonly locations: LocationService,
    private readonly scheduled: ScheduledPriceChangeReadService,
    private readonly lock: PriceChangeLock,
    private readonly applier: PriceChangeApplier,
    private readonly writer: PriceChangeWriter,
    private readonly history: PriceChangeHistoryService,
  ) {}

  async preview(
    locationId: string,
    file: ServicePriceImportUpload | undefined,
    rawDate: string | undefined,
    canReadCost: boolean,
    now = new Date(),
  ): Promise<ProductPriceImportPreview> {
    const effectiveDate = await this.parseDate(locationId, rawDate, now);
    const sheet = await this.readSheet(file);
    const { date, plan, rows } = await this.load(
      locationId,
      sheet,
      effectiveDate,
      canReadCost,
      now,
    );
    const conflicts =
      effectiveDate === null
        ? []
        : await this.writer.findConflicts(this.db, locationId, effectiveDate, {
            productIds: new Map(
              rows.map((row) => [row.productLocationId, row.productId]),
            ),
          });
    return {
      date,
      rows,
      errors: plan.errors.slice(0, PRODUCT_PRICE_IMPORT_MAX_LISTED_ERRORS),
      errorCount: plan.errors.length,
      counts: { products: rows.length, rows: rows.length },
      conflicts,
      canApply: plan.errors.length === 0 && rows.length > 0,
    };
  }

  /** 400 PRICE_IMPORT_INVALID for row errors. A file that changes no price gives `change: null`. */
  async import(
    locationId: string,
    file: ServicePriceImportUpload | undefined,
    rawDate: string | undefined,
    actor: AuditActor,
    now = new Date(),
  ): Promise<ProductPriceImportResult> {
    const effectiveDate = await this.parseDate(locationId, rawDate, now);
    const sheet = await this.readSheet(file);
    this.assertImportable(
      (await this.load(locationId, sheet, effectiveDate, false, now)).plan,
    );
    // multer decodes the multipart file name as latin1; the browser sends utf8.
    const fileName = Buffer.from(file?.originalname ?? '', 'latin1')
      .toString('utf8')
      .slice(0, 255);
    const done = await this.db.$transaction(
      async (tx) => {
        await this.lock.lock(tx, locationId);
        await this.applier.applyDue(tx, locationId, now);
        // The same check again under the lock: another change may have landed meanwhile.
        const { plan, rows } = await this.load(
          locationId,
          sheet,
          effectiveDate,
          false,
          now,
          tx,
        );
        this.assertImportable(plan);
        const written = await this.writer.write(tx, {
          locationId,
          catalog: PriceChangeCatalog.PRODUCTS,
          source: PriceChangeSource.IMPORT,
          effectiveDate,
          ruleSpec: null,
          fileName,
          createdServicesCount: 0,
          items: rows.map(
            (row): PriceChangeItemDraft => ({
              targetType: PriceChangeTarget.PRODUCT,
              serviceId: null,
              priceLevelId: null,
              staffId: null,
              bundleId: null,
              productLocationId: row.productLocationId,
              targetTitle: row.title.slice(0, 150),
              levelName: null,
              staffName: null,
              beforePrice: MoneyUtils.fromMinor(row.before),
              afterPrice: MoneyUtils.fromMinor(row.after),
            }),
          ),
          productIds: new Map(
            rows.map((row) => [row.productLocationId, row.productId]),
          ),
          actor,
          now,
        });
        return {
          written,
          due: written ? [] : this.applier.takeDueApplied(tx),
        };
      },
      { timeout: PRICE_CHANGE_TX_TIMEOUT_MS },
    );
    if (!done.written) {
      await this.writer.afterCommitDue(locationId, done.due);
      return { change: null };
    }
    await this.writer.afterCommit(locationId, done.written, actor, true);
    return { change: await this.history.findSummary(done.written.changeId) };
  }

  private assertImportable(plan: ProductPriceImportPlan): void {
    if (plan.errors.length > 0)
      throw new AppException(
        ErrorCode.PRICE_IMPORT_INVALID,
        HttpStatus.BAD_REQUEST,
        {
          errorCount: plan.errors.length,
          errors: plan.errors.slice(0, PRODUCT_PRICE_IMPORT_MAX_LISTED_ERRORS),
        },
      );
  }

  private async parseDate(
    locationId: string,
    raw: string | undefined,
    now: Date,
  ): Promise<string | null> {
    const { timezone } = await this.locations.getLocale(locationId);
    return parseImportEffectiveDate(raw, TimeUtils.zonedDateStr(now, timezone));
  }

  /** 400 PRICE_IMPORT_FILE_INVALID { reason[, columns] } for a file that cannot be read. */
  private async readSheet(
    file: ServicePriceImportUpload | undefined,
  ): Promise<ProductPriceSheet> {
    const read = await this.sheets.read(file);
    if (read.ok) return read.sheet;
    throw new AppException(
      ErrorCode.PRICE_IMPORT_FILE_INVALID,
      HttpStatus.BAD_REQUEST,
      {
        reason: read.reason,
        ...(read.reason === ServicePriceImportFileReason.MISSING_COLUMNS
          ? { columns: read.columns }
          : {}),
      },
    );
  }

  /** Reads the products and the scheduled prices and checks the file against them. */
  private async load(
    locationId: string,
    sheet: ProductPriceSheet,
    effectiveDate: string | null,
    canReadCost: boolean,
    now: Date,
    db: Prisma.TransactionClient = this.db,
  ): Promise<Loaded> {
    const { timezone } = await this.locations.getLocale(locationId, db);
    const date = effectiveDate ?? TimeUtils.zonedDateStr(now, timezone);
    const ids = [
      ...new Set(
        sheet.rows.flatMap((row) => {
          const id = row.id.trim().toLowerCase();
          return id ? [id] : [];
        }),
      ),
    ];
    const [refs, priced, entries] = await Promise.all([
      this.products.findLocationRefs(locationId, ids, db),
      this.products.listPriced(locationId, db),
      this.scheduled.listForSnapshot(locationId, db),
    ]);
    const plan = planProductPriceImport(
      sheet,
      new Map(refs.map((ref) => [ref.productId.toLowerCase(), ref])),
    );
    const changed = priced.filter((product) => plan.prices.has(product.productId));
    if (changed.length > PRICE_CHANGE_MAX_ITEMS)
      throw new AppException(
        ErrorCode.PRICE_CHANGE_TOO_LARGE,
        HttpStatus.BAD_REQUEST,
        { max: PRICE_CHANGE_MAX_ITEMS },
      );
    const costs = await this.inventory.lastPurchaseUnitCosts(
      locationId,
      changed.map((product) => product.productLocationId),
      db,
    );
    const rows = buildProductImportRows(
      plan.prices,
      changed,
      date,
      new PriceTimeline(entries),
      costs,
      canReadCost,
    );
    return { date, plan, rows };
  }
}
