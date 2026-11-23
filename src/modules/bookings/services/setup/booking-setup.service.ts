import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../../../../shared/exceptions/app.exception.js';
import { assignStaff } from '../../../../shared/scheduling/assign-staff.js';
import { normalizeStaffAssignments } from '../../../../shared/scheduling/normalize-staff-assignments.js';
import { ReadConsistency } from '../../../../shared/cache/enums/read-consistency.enum.js';
import { MoneyUtils } from '../../../../shared/money/money.utils.js';
import { TimeUtils } from '../../../../shared/time/time.utils.js';
import { ErrorCode } from '../../../../shared/validation/error-codes.enum.js';
import { BillingFacade } from '../../../billing/billing.facade.js';
import { ProductsService } from '../../../products/services/products.service.js';
import { ServiceCatalogFacade } from '../../../services/catalog/service-catalog.facade.js';
import { BundleMetrics } from '../../../services/utils/bundle-metrics.js';
import { PricingFacade } from '../../../pricing/pricing.facade.js';
import { StaffService } from '../../../staff/services/staff.service.js';
import { BookingResolveRequestDto } from '../../dto/booking-resolve-request.dto.js';
import { BookingSelectionResolution } from '../../interfaces/booking-selection-resolution.interface.js';
import { LocationService } from '../../../location/services/location.service.js';
import { BookingSelectionService } from '../booking-selection.service.js';
import { BookingSchedulingService } from '../booking-scheduling.service.js';
import { BookingExecutionMode } from '../../enums/booking-execution-mode.enum.js';
import { StaffSelectionMode } from '../../enums/staff-selection-mode.enum.js';
import { BookingSetup } from '../../interfaces/booking-setup.interface.js';
import { buildBookingSetupPrices } from '../../rules/booking-setup-prices.rules.js';
import {
  staffLinePrice,
  staffVisitPrice,
} from '../../rules/booking-staff-price.rules.js';

@Injectable()
export class BookingSetupService {
  constructor(
    private readonly serviceCatalog: ServiceCatalogFacade,
    private readonly staffService: StaffService,
    private readonly productsService: ProductsService,
    private readonly locationService: LocationService,
    private readonly selection: BookingSelectionService,
    private readonly scheduling: BookingSchedulingService,
    private readonly billing: BillingFacade,
    private readonly pricing: PricingFacade,
  ) {}

  async getBookingSetup(locationId: string): Promise<BookingSetup> {
    const settings = this.locationService.getBookingSettings(locationId);
    const [catalog, staff, products, location, isOnlineBookingAvailable, book] =
      await Promise.all([
        this.serviceCatalog.loadForBooking(locationId),
        this.staffService.listActiveWithServices(locationId),
        this.productsService.listForPublicCatalog(locationId),
        settings,
        settings.then(({ brandId }) =>
          this.billing.isOnlineBookingOpen(brandId),
        ),
        this.pricing.priceBook(locationId, ReadConsistency.CACHED),
      ]);
    return {
      catalog,
      staff,
      products,
      isOnlineBookingAvailable,
      anyStaffEnabled: location.anyStaffEnabled,
      prices: buildBookingSetupPrices(book, catalog, staff),
    };
  }

  async resolveBookingSelection(
    locationId: string,
    dto: BookingResolveRequestDto,
  ): Promise<BookingSelectionResolution> {
    if (dto.bundleId && dto.serviceIds?.length) {
      throw new AppException(
        ErrorCode.BOOKING_SELECTION_CONFLICT,
        HttpStatus.BAD_REQUEST,
      );
    }

    const [{ services, bundles }, book] = await Promise.all([
      this.serviceCatalog.loadForBooking(locationId),
      this.pricing.priceBook(locationId, ReadConsistency.CACHED),
    ]);
    const serviceById = new Map(
      services.map((service) => [service.id, service]),
    );

    const bundle = dto.bundleId
      ? bundles.find((item) => item.id === dto.bundleId)
      : undefined;
    const selected = dto.bundleId
      ? bundle?.items.map((item) => item.service)
      : dto.serviceIds
          ?.map((id) => serviceById.get(id))
          .filter(
            (service): service is NonNullable<typeof service> => !!service,
          );
    const executionMode =
      (bundle?.executionMode as BookingExecutionMode | undefined) ??
      BookingExecutionMode.SEQUENTIAL;

    if (
      (dto.bundleId && !bundle) ||
      (dto.serviceIds?.length && selected?.length !== dto.serviceIds.length)
    ) {
      throw new AppException(
        ErrorCode.BOOKING_SERVICE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }
    const requested = normalizeStaffAssignments(
      selected?.map((service) => service.id) ?? [],
      executionMode,
      dto.staffId,
      dto.staffAssignments,
    );

    const directory =
      await this.staffService.listActiveWithServices(locationId);
    let availableServiceIds = [
      ...services.map((service) => service.id),
      ...bundles.map((item) => item.id),
    ];
    if (dto.staffId) {
      const performable = new Set(
        directory
          .find((member) => member.id === dto.staffId)
          ?.staffServices.map((item) => item.serviceId) ?? [],
      );
      availableServiceIds = services
        .filter((service) => performable.has(service.id))
        .map((service) => service.id);
      for (const item of bundles) {
        const parallel =
          item.executionMode === BookingExecutionMode.PARALLEL &&
          item.items.length > 1;
        const team =
          parallel &&
          assignStaff(
            item.items.map((entry, index) => ({
              itemId: String(index),
              staffIds: directory
                .filter((member) =>
                  member.staffServices.some(
                    (skill) => skill.serviceId === entry.serviceId,
                  ),
                )
                .map((member) => member.id),
            })),
            true,
          );
        if (
          parallel
            ? team
            : item.items.every((entry) => performable.has(entry.serviceId))
        ) {
          availableServiceIds.push(item.id);
        }
      }
    }

    if (!selected?.length) {
      const availableStaff = directory
        .filter((member) => !dto.staffId || member.id === dto.staffId)
        .map(({ id, name }) => ({ id, name, price: MoneyUtils.decimal(0) }));
      return {
        availableServiceIds,
        availableStaff,
        staffSelection: StaffSelectionMode.SINGLE,
        executionMode: BookingExecutionMode.SEQUENTIAL,
        totalDuration: 0,
        totalListPrice: new Prisma.Decimal(0),
        staffByService: [],
        canAssignStaff: availableStaff.length > 0,
        resolvedItems: [],
        totalPrice: null,
      };
    }

    const selectedIds = selected.map((service) => service.id);
    const priceBundleId = bundle?.id ?? null;
    this.pricing.assertPriceable(book, priceBundleId, selectedIds);

    const coverableBySingle = directory
      .filter((member) => {
        const performed = new Set(
          member.staffServices.map((item) => item.serviceId),
        );
        return selected.every((service) => performed.has(service.id));
      })
      .map(({ id, name }) => ({
        id,
        name,
        price: MoneyUtils.fromMinor(
          staffVisitPrice(book, priceBundleId, selectedIds, id),
        ),
      }));
    const totalListPrice = bundle
      ? BundleMetrics.price(bundle)
      : selected.reduce(
          (sum, service) => sum.plus(service.price),
          new Prisma.Decimal(0),
        );
    const totalDuration = BundleMetrics.durationMinutes({
      executionMode,
      items: selected.map((service) => ({ service })),
    });

    const parallel =
      executionMode === BookingExecutionMode.PARALLEL && selected.length > 1;
    const staffByService = selected.map((service, index) => ({
      serviceId: service.id,
      availableStaff: directory
        .filter((member) =>
          member.staffServices.some((entry) => entry.serviceId === service.id),
        )
        .map(({ id, name }) => ({
          id,
          name,
          price: MoneyUtils.fromMinor(
            staffLinePrice(book, priceBundleId, selectedIds, index, id),
          ),
        })),
    }));
    const candidates = staffByService.map((entry, index) => {
      const staffId = requested.get(entry.serviceId);
      const available = entry.availableStaff.filter(
        (member) => !staffId || member.id === staffId,
      );
      if (staffId && !available.length)
        throw new AppException(
          ErrorCode.BOOKING_STAFF_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      return {
        itemId: String(index),
        staffIds: available.map((member) => member.id),
      };
    });
    const canAssignStaff = assignStaff(candidates, parallel) !== null;
    const resolvedItems = dto.startAt
      ? await this.preview(locationId, dto)
      : [];

    return {
      availableServiceIds,
      availableStaff: parallel ? [] : coverableBySingle,
      staffByService,
      canAssignStaff,
      resolvedItems,
      staffSelection: parallel
        ? StaffSelectionMode.PER_SERVICE
        : coverableBySingle.length
          ? StaffSelectionMode.SINGLE
          : StaffSelectionMode.NONE,
      executionMode,
      totalDuration,
      totalListPrice,
      totalPrice: dto.startAt
        ? resolvedItems.reduce(
            (sum, item) => sum.plus(item.chargedPrice),
            MoneyUtils.decimal(0),
          )
        : null,
    };
  }

  private async preview(locationId: string, dto: BookingResolveRequestDto) {
    const [selection, location] = await Promise.all([
      this.selection.resolveForBooking(locationId, dto),
      // Cached like the preview prices; the rule is read with the timezone.
      this.locationService.getBookingSettings(locationId),
    ]);
    return this.scheduling.resolveForBooking({
      locationId,
      bundleId: selection.bundleId,
      prices: ReadConsistency.CACHED,
      services: selection.services,
      executionMode: selection.executionMode,
      startAt: TimeUtils.localToUtc(dto.startAt!, location.timezone),
      requestedStaffId: dto.staffId,
      staffAssignments: dto.staffAssignments,
      timezone: location.timezone,
      manualItems: [],
      staffRule: location.anyStaffRule,
      customEndAt: dto.endAt
        ? TimeUtils.localToUtc(dto.endAt, location.timezone)
        : null,
    });
  }
}
