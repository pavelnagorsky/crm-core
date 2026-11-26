import { HttpStatus, Injectable } from '@nestjs/common';
import {
  BookingStatus,
  Prisma,
  PriceChangeCatalog,
  PriceChangeSource,
} from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { AppCacheService } from '../../../shared/cache/app-cache.service.js';
import { CacheDependency } from '../../../shared/cache/cache-dependency.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { Claim } from '../../access/enums/claim.enum.js';
import { Write } from '../../access/utils/permission.js';
import { hasPermission } from '../../access/utils/assert-permission.js';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { TokenPayloadDto } from '../../auth/dto/token-payload.dto.js';
import { LocationService } from '../../location/services/location.service.js';
import { ServiceCatalogFacade } from '../../services/catalog/service-catalog.facade.js';
import { ImportedCatalogCreation } from '../../services/service-write/interfaces/imported-catalog-creation.interface.js';
import { ServiceImportWriteService } from '../../services/service-write/services/service-import-write.service.js';
import { StaffService } from '../../staff/services/staff.service.js';
import {
  PRICE_CHANGE_MAX_ITEMS,
  PRICE_CHANGE_TX_TIMEOUT_MS,
} from '../constants/price-change.constants.js';
import { SERVICE_PRICE_IMPORT_MAX_LISTED_ERRORS } from '../constants/service-price-import.constants.js';
import { PriceTimeline } from '../engine/price-timeline.js';
import { ServicePriceImportFileReason } from '../enums/service-price-import-file-reason.enum.js';
import { ServicePriceImportCounts } from '../interfaces/service-price-import-counts.interface.js';
import { PriceChangeWriteResult } from '../interfaces/price-change-write-result.interface.js';
import { ServicePriceImportChange } from '../interfaces/service-price-import-change.interface.js';
import { ServicePriceImportFacts } from '../interfaces/service-price-import-facts.interface.js';
import { ServicePriceImportPlan } from '../interfaces/service-price-import-plan.interface.js';
import { ServicePriceImportPreview } from '../interfaces/service-price-import-preview.interface.js';
import { ServicePriceImportResult } from '../interfaces/service-price-import-result.interface.js';
import { ServicePriceImportUpload } from '../interfaces/service-price-import-upload.interface.js';
import { ServicePriceBook } from '../interfaces/service-price-book.interface.js';
import {
  buildImportCatalog,
  buildImportChange,
} from '../rules/service-price-import-change.rules.js';
import { planServicePriceImport } from '../rules/service-price-import.rules.js';
import { parseImportEffectiveDate } from '../rules/price-import-date.rules.js';
import { PriceLevelReadService } from './price-level-read.service.js';
import { ScheduledPriceChangeReadService } from './scheduled-price-change-read.service.js';
import { PriceChangeApplier } from './price-change-applier.service.js';
import { PriceChangeLock } from './price-change-lock.service.js';
import { ServicePriceChangeReadService } from './service-price-change-read.service.js';
import { PriceChangeWriter } from './price-change-writer.service.js';
import { ServicePriceSheetService } from './service-price-sheet.service.js';

type Loaded = {
  plan: ServicePriceImportPlan;
  facts: ServicePriceImportFacts;
  change: ServicePriceImportChange;
};

/** Price file upload: the preview without writes and the import under the location lock. */
@Injectable()
export class ServicePriceImportService {
  constructor(
    private readonly db: DatabaseService,
    private readonly sheet: ServicePriceSheetService,
    private readonly catalog: ServiceCatalogFacade,
    private readonly levels: PriceLevelReadService,
    private readonly staff: StaffService,
    private readonly locations: LocationService,
    private readonly scheduled: ScheduledPriceChangeReadService,
    private readonly lock: PriceChangeLock,
    private readonly applier: PriceChangeApplier,
    private readonly writer: PriceChangeWriter,
    private readonly readService: ServicePriceChangeReadService,
    private readonly serviceImport: ServiceImportWriteService,
    private readonly cache: AppCacheService,
  ) {}

  async preview(
    locationId: string,
    file: ServicePriceImportUpload | undefined,
    rawDate: string | undefined,
    now = new Date(),
  ): Promise<ServicePriceImportPreview> {
    const effectiveDate = await this.parseDate(locationId, rawDate, now);
    const book = await this.readBook(file);
    const { plan, facts, change } = await this.load(
      locationId,
      book,
      effectiveDate,
      now,
    );
    const { timezone } = await this.locations.getLocale(locationId);
    const [affectedBookingsCount, conflicts] = await Promise.all([
      effectiveDate === null
        ? Promise.resolve(0)
        : this.countAffectedBookings(
            locationId,
            TimeUtils.zonedDateStart(effectiveDate, timezone),
            change,
          ),
      effectiveDate === null
        ? Promise.resolve([])
        : this.writer.findConflicts(
            this.db,
            locationId,
            effectiveDate,
            { serviceIds: change.serviceIds, bundleIds: change.bundleIds },
          ),
    ]);
    const counts = this.counts(plan, change);
    return {
      date: facts.date,
      newServices: plan.newServices,
      groups: change.groups,
      errors: plan.errors.slice(0, SERVICE_PRICE_IMPORT_MAX_LISTED_ERRORS),
      errorCount: plan.errors.length,
      counts,
      affectedBookingsCount,
      conflicts,
      canApply:
        plan.errors.length === 0 &&
        (counts.newServices > 0 || counts.rows > 0),
    };
  }

  async import(
    locationId: string,
    file: ServicePriceImportUpload | undefined,
    rawDate: string | undefined,
    actor: AuditActor,
    token: TokenPayloadDto,
    now = new Date(),
  ): Promise<ServicePriceImportResult> {
    const effectiveDate = await this.parseDate(locationId, rawDate, now);
    const book = await this.readBook(file);
    const early = await this.load(locationId, book, effectiveDate, now);
    this.assertImportable(early.plan);
    if (
      early.plan.newServices.length > 0 &&
      !hasPermission(token, Write(Claim.SERVICE), locationId, true)
    )
      throw new AppException(
        ErrorCode.SERVICE_PRICE_IMPORT_SERVICE_ACCESS,
        HttpStatus.FORBIDDEN,
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
        const { plan, change } = await this.load(
          locationId,
          book,
          effectiveDate,
          now,
          tx,
        );
        this.assertImportable(plan);

        const creation = await this.serviceImport.create(
          tx,
          locationId,
          plan.newServices.map((item) => ({
            title: item.title,
            description: item.description,
            price: item.price,
            durationMinutes: item.durationMinutes,
            categoryName: item.categoryName,
          })),
        );
        const levelRows = creation.services.flatMap(({ service }, index) =>
          plan.newServices[index].levelPrices.map((level) => ({
            serviceId: service.id,
            priceLevelId: level.levelId,
            price: level.price,
          })),
        );
        if (levelRows.length > 0)
          await tx.serviceLevelPrice.createMany({ data: levelRows });

        const written = await this.writer.write(tx, {
          locationId,
          catalog: PriceChangeCatalog.SERVICES,
          source: PriceChangeSource.IMPORT,
          effectiveDate,
          ruleSpec: null,
          fileName,
          createdServicesCount: creation.services.length,
          items: change.drafts,
          actor,
          now,
        });
        return {
          creation,
          written,
          due: written ? [] : this.applier.takeDueApplied(tx),
        };
      },
      { timeout: PRICE_CHANGE_TX_TIMEOUT_MS },
    );

    await this.afterCommit(locationId, done, actor);
    return {
      change: await this.summary(done.written),
      createdServicesCount: done.creation.services.length,
      createdCategoriesCount: done.creation.categories.length,
      createdServiceIds: done.creation.services.map(({ service }) => service.id),
    };
  }

  private async afterCommit(
    locationId: string,
    done: {
      creation: ImportedCatalogCreation;
      written: PriceChangeWriteResult | null;
      due: PriceChangeWriteResult['dueApplied'];
    },
    actor: AuditActor,
  ): Promise<void> {
    await this.serviceImport.afterCommit(locationId, done.creation, actor);
    if (done.written)
      await this.writer.afterCommit(
        locationId,
        done.written,
        actor,
        true,
      );
    else await this.writer.afterCommitDue(locationId, done.due ?? []);
    if (done.creation.services.length > 0)
      await this.cache.invalidate(CacheDependency.pricing(locationId));
  }

  private async summary(
    written: PriceChangeWriteResult | null,
  ): Promise<ServicePriceImportResult['change']> {
    if (!written) return null;
    const change = await this.db.priceChange.findUnique({
      where: { id: written.changeId },
    });
    if (!change) return null;
    const [view] = await this.readService.withAuthors([change]);
    return view;
  }

  private counts(
    plan: ServicePriceImportPlan,
    change: ServicePriceImportChange,
  ): ServicePriceImportCounts {
    return {
      newServices: plan.newServices.length,
      newCategories: plan.newCategories.length,
      services: change.serviceIds.length,
      bundles: change.bundleIds.length,
      rows: change.drafts.length,
    };
  }

  private assertImportable(plan: ServicePriceImportPlan): void {
    if (plan.errors.length > 0)
      throw new AppException(
        ErrorCode.PRICE_IMPORT_INVALID,
        HttpStatus.BAD_REQUEST,
        {
          errorCount: plan.errors.length,
          errors: plan.errors.slice(0, SERVICE_PRICE_IMPORT_MAX_LISTED_ERRORS),
        },
      );
  }

  /** The effective date of the form: empty is now; 400 unless later than today and within two years. */
  private async parseDate(
    locationId: string,
    raw: string | undefined,
    now: Date,
  ): Promise<string | null> {
    const { timezone } = await this.locations.getLocale(locationId);
    return parseImportEffectiveDate(raw, TimeUtils.zonedDateStr(now, timezone));
  }

  private async readBook(
    file: ServicePriceImportUpload | undefined,
  ): Promise<ServicePriceBook> {
    const read = await this.sheet.read(file);
    if (read.ok) return read.book;
    const { reason, sheet, columns } = read;
    throw new AppException(
      ErrorCode.PRICE_IMPORT_FILE_INVALID,
      HttpStatus.BAD_REQUEST,
      {
        reason,
        ...(reason === ServicePriceImportFileReason.MISSING_COLUMNS
          ? { sheet, columns }
          : {}),
        ...(reason === ServicePriceImportFileReason.TOO_MANY_ROWS
          ? { sheet }
          : {}),
      },
    );
  }

  /** Reads the stored prices and checks the file against them. */
  private async load(
    locationId: string,
    book: ServicePriceBook,
    effectiveDate: string | null,
    now: Date,
    db: Prisma.TransactionClient = this.db,
  ): Promise<Loaded> {
    const { timezone } = await this.locations.getLocale(locationId, db);
    const date = effectiveDate ?? TimeUtils.zonedDateStr(now, timezone);
    const [catalog, levels, levelPrices, assignments, entries] =
      await Promise.all([
        this.catalog.loadPriceCatalog(locationId, db),
        this.levels.listLevels(locationId, db),
        this.levels.listLevelPrices(locationId, db),
        this.staff.listActiveAssignments(locationId, db),
        this.scheduled.listForSnapshot(locationId, db),
      ]);
    const facts: ServicePriceImportFacts = {
      catalog,
      levels,
      levelPrices,
      assignments,
      timeline: new PriceTimeline(entries),
      date,
    };
    const plan = planServicePriceImport(book, buildImportCatalog(facts));
    const change = buildImportChange(plan, facts);
    if (change.drafts.length > PRICE_CHANGE_MAX_ITEMS)
      throw new AppException(
        ErrorCode.PRICE_CHANGE_TOO_LARGE,
        HttpStatus.BAD_REQUEST,
        { max: PRICE_CHANGE_MAX_ITEMS },
      );
    return { plan, facts, change };
  }

  /** Pending and confirmed bookings from the date on for the changed services and bundles. */
  private countAffectedBookings(
    locationId: string,
    from: Date,
    change: ServicePriceImportChange,
  ): Promise<number> {
    if (change.serviceIds.length === 0 && change.bundleIds.length === 0)
      return Promise.resolve(0);
    return this.db.booking.count({
      where: {
        locationId,
        deletedAt: null,
        status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
        OR: [
          {
            items: {
              some: {
                startAt: { gte: from },
                serviceId: { in: change.serviceIds },
              },
            },
          },
          {
            bundleId: { in: change.bundleIds },
            items: { some: { startAt: { gte: from } } },
          },
        ],
      },
    });
  }
}
