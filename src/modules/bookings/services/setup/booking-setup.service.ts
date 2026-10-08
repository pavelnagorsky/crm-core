import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../../../../shared/exceptions/app.exception.js';
import { MoneyService } from '../../../../shared/money/money.service.js';
import { ErrorCode } from '../../../../shared/validation/error-codes.enum.js';
import { StaffService } from '../../../staff/staff.service.js';
import { ServiceCatalogService } from '../../../services/catalog/service-catalog.service.js';
import { BundleMetrics } from '../../../services/utils/bundle-metrics.js';
import { BookingResolveRequestDto } from '../../dto/booking-resolve-request.dto.js';
import { BookingResolveResponseDto } from '../../dto/booking-resolve-response.dto.js';
import { BookingSetupCategoryDto } from '../../dto/booking-setup-category.dto.js';
import { BookingSetupResponseDto } from '../../dto/booking-setup-response.dto.js';
import { BookingSetupStaffDto } from '../../dto/booking-setup-staff.dto.js';
import { BookingExecutionMode } from '../../enums/booking-execution-mode.enum.js';
import { StaffSelectionMode } from '../../enums/staff-selection-mode.enum.js';

@Injectable()
export class BookingSetupService {
  constructor(
    private readonly serviceCatalog: ServiceCatalogService,
    private readonly staffService: StaffService,
  ) {}

  async getBookingSetup(locationId: string): Promise<BookingSetupResponseDto> {
    const [catalog, staff] = await Promise.all([
      this.serviceCatalog.loadForBooking(locationId),
      this.staffService.listActiveWithServices(locationId),
    ]);
    const uncategorizedServices = catalog.services.filter(
      (service) => service.categoryId === null,
    );
    const uncategorizedBundles = catalog.bundles.filter(
      (bundle) => bundle.categoryId === null,
    );
    const result = catalog.categories.map(BookingSetupCategoryDto.fromEntity);
    if (uncategorizedServices.length || uncategorizedBundles.length) {
      result.push(
        BookingSetupCategoryDto.uncategorized(
          uncategorizedServices,
          uncategorizedBundles,
        ),
      );
    }

    return {
      categories: result,
      staff: staff.map(BookingSetupStaffDto.fromEntity),
    };
  }

  async resolveBookingSelection(
    locationId: string,
    dto: BookingResolveRequestDto,
  ): Promise<BookingResolveResponseDto> {
    if (dto.bundleId && dto.serviceIds?.length) {
      throw new AppException(
        ErrorCode.BOOKING_SELECTION_CONFLICT,
        HttpStatus.BAD_REQUEST,
      );
    }

    const { services, bundles } =
      await this.serviceCatalog.loadForBooking(locationId);
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

    let availableServiceIds = [
      ...services.map((service) => service.id),
      ...bundles.map((item) => item.id),
    ];
    if (dto.staffId) {
      const performable = new Set(
        await this.staffService.servicesPerformableBy(locationId, dto.staffId),
      );
      availableServiceIds = services
        .filter((service) => performable.has(service.id))
        .map((service) => service.id);
      for (const item of bundles) {
        if (item.items.every((entry) => performable.has(entry.serviceId))) {
          availableServiceIds.push(item.id);
        }
      }
    }

    if (!selected?.length) {
      const availableStaff = dto.staffId
        ? [
            {
              id: dto.staffId,
              name: (await this.staffService.findById(dto.staffId)).name,
            },
          ]
        : (await this.staffService.listActiveWithServices(locationId)).map(
            (staff) => ({ id: staff.id, name: staff.name }),
          );
      return {
        availableServiceIds,
        availableStaff,
        staffSelection: StaffSelectionMode.SINGLE,
        executionMode: BookingExecutionMode.SEQUENTIAL,
        totalDuration: 0,
        totalListPrice: MoneyService.format(0),
      };
    }

    const staffing = await this.staffService.resolveStaffingForServices(
      locationId,
      selected.map((service) => service.id),
    );
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

    return {
      availableServiceIds,
      availableStaff: staffing.coverableBySingle,
      staffSelection: staffing.coverableBySingle.length
        ? StaffSelectionMode.SINGLE
        : StaffSelectionMode.NONE,
      executionMode,
      totalDuration,
      totalListPrice: MoneyService.format(totalListPrice),
    };
  }
}
