import { HttpStatus, Injectable } from '@nestjs/common';
import { BookingStatus, BundlePricingMode, Prisma } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { LocationService } from '../../location/services/location.service.js';
import { ServiceCatalogFacade } from '../../services/catalog/service-catalog.facade.js';
import { StaffService } from '../../staff/services/staff.service.js';
import { PRICE_CHANGE_MAX_ITEMS } from '../constants/price-change.constants.js';
import { ServicePriceChangeSpecDto } from '../dto/service-price-change-spec.dto.js';
import { ServicePriceChangeGroupKind } from '../enums/service-price-change-group-kind.enum.js';
import { PriceTimeline } from '../engine/price-timeline.js';
import { PriceChangeFacts } from '../interfaces/price-change-facts.interface.js';
import { PriceChangePreview } from '../interfaces/price-change-preview.interface.js';
import { PriceChangeSpec } from '../interfaces/price-change-spec.interface.js';
import {
  buildPriceChangeGroups,
  countPriceChangeRows,
  selectPriceChangeScope,
} from '../rules/service-price-change-rows.rules.js';
import {
  assertPriceChangeDate,
  parsePriceChangeSpec,
} from '../rules/service-price-change-spec.rules.js';
import { PriceLevelReadService } from './price-level-read.service.js';
import { ScheduledPriceChangeReadService } from './scheduled-price-change-read.service.js';
import { PriceChangeWriter } from './price-change-writer.service.js';

/** Computes the rows of a price change rule: what each price is on the date and becomes. */
@Injectable()
export class ServicePriceChangePreviewService {
  constructor(
    private readonly db: DatabaseService,
    private readonly catalog: ServiceCatalogFacade,
    private readonly levels: PriceLevelReadService,
    private readonly staff: StaffService,
    private readonly locations: LocationService,
    private readonly scheduled: ScheduledPriceChangeReadService,
    private readonly writer: PriceChangeWriter,
  ) {}

  /** The preview of a rule request. */
  preview(
    locationId: string,
    dto: ServicePriceChangeSpecDto,
    now = new Date(),
  ): Promise<PriceChangePreview> {
    return this.compute(locationId, parsePriceChangeSpec(dto), now);
  }

  /**
   * Preview of a parsed rule. 400 for a bad scope, date or size. Reads fresh data, so the
   * create runs the same computation under the location lock.
   */
  async compute(
    locationId: string,
    spec: PriceChangeSpec,
    now: Date,
    db: Prisma.TransactionClient = this.db,
  ): Promise<PriceChangePreview> {
    const { timezone } = await this.locations.getLocale(locationId, db);
    const today = TimeUtils.zonedDateStr(now, timezone);
    assertPriceChangeDate(spec.effectiveDate, today);
    const date = spec.effectiveDate ?? today;
    const [price, levels, levelPrices, assignments, entries] =
      await Promise.all([
        this.catalog.loadPriceCatalog(locationId, db),
        this.levels.listLevels(locationId, db),
        this.levels.listLevelPrices(locationId, db),
        this.staff.listActiveAssignments(locationId, db),
        this.scheduled.listForSnapshot(locationId, db),
      ]);
    this.assertScope(spec, price);
    const scope = selectPriceChangeScope(
      {
        services: price.services,
        bundles: price.bundles.map((bundle) => ({
          id: bundle.id,
          categoryId: bundle.categoryId,
          fixed:
            bundle.pricingMode === BundlePricingMode.FIXED &&
            bundle.fixedPrice !== null,
        })),
      },
      spec,
    );
    const serviceIds = new Set(scope.serviceIds);
    const bundleIds = new Set(scope.bundleIds);
    const levelByService = new Map<string, Record<string, number>>();
    for (const row of levelPrices) {
      if (!serviceIds.has(row.serviceId)) continue;
      const prices = levelByService.get(row.serviceId) ?? {};
      prices[row.priceLevelId] = MoneyUtils.toMinor(row.price);
      levelByService.set(row.serviceId, prices);
    }
    const staffByService = new Map<
      string,
      { staffId: string; name: string; price: number | null }[]
    >();
    for (const row of assignments) {
      if (!serviceIds.has(row.serviceId)) continue;
      const list = staffByService.get(row.serviceId) ?? [];
      list.push({
        staffId: row.staffId,
        name: row.staffName,
        price: row.price === null ? null : MoneyUtils.toMinor(row.price),
      });
      staffByService.set(row.serviceId, list);
    }
    const facts: PriceChangeFacts = {
      categories: price.categories,
      levels: levels
        .filter((level) => !level.isDefault)
        .map(({ id, name, sortOrder }) => ({ id, name, sortOrder })),
      services: price.services
        .filter((service) => serviceIds.has(service.id))
        .map((service) => ({
          id: service.id,
          title: service.title,
          categoryId: service.categoryId,
          status: service.status,
          sortOrder: service.sortOrder,
          price: MoneyUtils.toMinor(service.price),
          levelPrices: levelByService.get(service.id) ?? {},
          staff: staffByService.get(service.id) ?? [],
        })),
      bundles: price.bundles
        .filter((bundle) => bundleIds.has(bundle.id))
        .map((bundle) => ({
          id: bundle.id,
          title: bundle.title,
          categoryId: bundle.categoryId,
          status: bundle.status,
          sortOrder: bundle.sortOrder,
          price: MoneyUtils.toMinor(bundle.fixedPrice!),
        })),
    };
    const groups = buildPriceChangeGroups(
      facts,
      spec,
      date,
      new PriceTimeline(entries),
    );
    const counts = countPriceChangeRows(groups);
    if (counts.rows > PRICE_CHANGE_MAX_ITEMS)
      throw new AppException(
        ErrorCode.PRICE_CHANGE_TOO_LARGE,
        HttpStatus.BAD_REQUEST,
        { max: PRICE_CHANGE_MAX_ITEMS },
      );
    const groupServiceIds = groups
      .filter((group) => group.kind === ServicePriceChangeGroupKind.SERVICE)
      .map((group) => group.id);
    const groupBundleIds = groups
      .filter((group) => group.kind === ServicePriceChangeGroupKind.BUNDLE)
      .map((group) => group.id);
    const [affectedBookingsCount, conflicts] = await Promise.all([
      spec.effectiveDate === null
        ? Promise.resolve(0)
        : this.countAffectedBookings(
            locationId,
            TimeUtils.zonedDateStart(spec.effectiveDate, timezone),
            groupServiceIds,
            groupBundleIds,
            db,
          ),
      spec.effectiveDate === null
        ? Promise.resolve([])
        : this.writer.findConflicts(
            db,
            locationId,
            spec.effectiveDate,
            { serviceIds: groupServiceIds, bundleIds: groupBundleIds },
          ),
    ]);
    return { date, groups, counts, affectedBookingsCount, conflicts };
  }

  /** 400 PRICE_CHANGE_INVALID { field } for ids that are not the location's. */
  private assertScope(
    spec: PriceChangeSpec,
    catalog: {
      categories: { id: string }[];
      services: { id: string }[];
      bundles: { id: string; pricingMode: BundlePricingMode }[];
    },
  ): void {
    if (spec.allServices) return;
    const check = (field: string, ok: boolean) => {
      if (!ok)
        throw new AppException(
          ErrorCode.PRICE_CHANGE_INVALID,
          HttpStatus.BAD_REQUEST,
          { field },
        );
    };
    const services = new Set(catalog.services.map((item) => item.id));
    const categories = new Set(catalog.categories.map((item) => item.id));
    const fixed = new Set(
      catalog.bundles
        .filter((item) => item.pricingMode === BundlePricingMode.FIXED)
        .map((item) => item.id),
    );
    check(
      'serviceIds',
      spec.serviceIds.every((id) => services.has(id)),
    );
    check(
      'categoryIds',
      spec.categoryIds.every((id) => categories.has(id)),
    );
    check(
      'bundleIds',
      spec.bundleIds.every((id) => fixed.has(id)),
    );
  }

  /**
   * Pending and confirmed bookings with a visit from the date on that include one of the
   * services, or are of one of the bundles. They keep the price they were made at.
   */
  private countAffectedBookings(
    locationId: string,
    from: Date,
    serviceIds: readonly string[],
    bundleIds: readonly string[],
    db: Prisma.TransactionClient,
  ): Promise<number> {
    if (serviceIds.length === 0 && bundleIds.length === 0)
      return Promise.resolve(0);
    return db.booking.count({
      where: {
        locationId,
        deletedAt: null,
        status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
        OR: [
          {
            items: {
              some: { startAt: { gte: from }, serviceId: { in: [...serviceIds] } },
            },
          },
          {
            bundleId: { in: [...bundleIds] },
            items: { some: { startAt: { gte: from } } },
          },
        ],
      },
    });
  }
}
