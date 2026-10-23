import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../../../../shared/exceptions/app.exception.js';
import { MoneyUtils } from '../../../../shared/money/money.utils.js';
import { ErrorCode } from '../../../../shared/validation/error-codes.enum.js';
import { ProductsService } from '../../../products/services/products.service.js';
import { ServiceCatalogFacade } from '../../../services/catalog/service-catalog.facade.js';
import { BundleMetrics } from '../../../services/utils/bundle-metrics.js';
import { StaffService } from '../../../staff/services/staff.service.js';
import { BookingResolveRequestDto } from '../../dto/booking-resolve-request.dto.js';
import { BookingResolveResponseDto } from '../../dto/booking-resolve-response.dto.js';
import { BookingSetup } from '../../interfaces/booking-setup.interface.js';
import { BookingExecutionMode } from '../../enums/booking-execution-mode.enum.js';
import { StaffSelectionMode } from '../../enums/staff-selection-mode.enum.js';

@Injectable()
export class BookingSetupService {
  constructor(
    private readonly serviceCatalog: ServiceCatalogFacade,
    private readonly staffService: StaffService,
    private readonly productsService: ProductsService,
  ) {}

  async getBookingSetup(locationId: string): Promise<BookingSetup> {
    const [catalog, staff, products] = await Promise.all([
      this.serviceCatalog.loadForBooking(locationId),
      this.staffService.listActiveWithServices(locationId),
      this.productsService.listForPublicCatalog(locationId),
    ]);
    return { catalog, staff, products };
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
        totalListPrice: MoneyUtils.format(0),
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
      totalListPrice: MoneyUtils.format(totalListPrice),
    };
  }
}
