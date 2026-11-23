import { HttpStatus, Injectable } from '@nestjs/common';
import {
  OrderItemType,
  Prisma,
  BookingExecutionMode as PrismaBookingExecutionMode,
} from '@prisma/client';
import { ReadConsistency } from '../../../shared/cache/enums/read-consistency.enum.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { normalizeStaffAssignments } from '../../../shared/scheduling/normalize-staff-assignments.js';
import { priceLine, sumPrices } from '../../../shared/money/line-pricing.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { LocationService } from '../../location/services/location.service.js';
import { OrderPricingLine } from '../../orders/interfaces/order-pricing-line.interface.js';
import { OrdersFacade } from '../../orders/orders.facade.js';
import { PricingFacade } from '../../pricing/pricing.facade.js';
import { ServiceCatalogFacade } from '../../services/catalog/service-catalog.facade.js';
import { BookingPricingRequestDto } from '../dto/booking-pricing-request.dto.js';
import { ManualBookingItemDto } from '../dto/manual-booking-item.dto.js';
import { BookingPricingResult } from '../interfaces/booking-pricing-result.interface.js';
import { BookingSelectionRequest } from '../interfaces/booking-selection-request.interface.js';
import { ResolvedBookingSelection } from '../interfaces/resolved-booking-selection.interface.js';

@Injectable()
export class BookingSelectionService {
  constructor(
    private readonly locationService: LocationService,
    private readonly serviceCatalog: ServiceCatalogFacade,
    private readonly orders: OrdersFacade,
    private readonly pricing: PricingFacade,
  ) {}

  async price(
    locationId: string,
    dto: BookingPricingRequestDto,
  ): Promise<BookingPricingResult> {
    const location = await this.locationService.findById(locationId);
    if (!location) {
      throw new AppException(
        ErrorCode.BOOKING_BUSINESS_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }

    const selection = this.hasServiceSelection(dto)
      ? await this.resolveForBooking(locationId, dto)
      : null;
    const serviceLines = selection
      ? await this.priceServiceLines(
          locationId,
          selection,
          this.manualItems(dto),
          dto,
        )
      : [];
    const productLines = await this.orders.priceProductItems(
      locationId,
      dto.products ?? [],
    );
    const serviceTotals = sumPrices(serviceLines);
    const productTotals = sumPrices(productLines);
    const totals = sumPrices([...serviceLines, ...productLines]);

    return {
      currency: location.currency,
      bundleId: selection?.bundleId ?? null,
      bundleTitle: selection?.bundleTitle ?? null,
      serviceTotal: serviceTotals.totalAmount,
      productTotal: productTotals.totalAmount,
      ...totals,
      items: [...serviceLines, ...productLines],
    };
  }

  async resolveForBooking(
    locationId: string,
    dto: BookingSelectionRequest,
  ): Promise<ResolvedBookingSelection> {
    if (
      dto.bundleId &&
      (dto.serviceIds?.length || dto.serviceId || this.manualItems(dto).length)
    ) {
      throw new AppException(
        ErrorCode.BOOKING_SELECTION_CONFLICT,
        HttpStatus.BAD_REQUEST,
      );
    }

    if (dto.bundleId) {
      const bundle = await this.serviceCatalog.resolveBundleForBooking(
        locationId,
        dto.bundleId,
      );
      if (bundle.items.length === 0)
        throw new AppException(
          ErrorCode.BOOKING_SERVICE_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      return {
        bundleId: bundle.id,
        bundleTitle: bundle.title,
        executionMode: bundle.executionMode,
        services: bundle.items.map(({ service }) => ({
          id: service.id,
          title: service.title,
          durationMinutes: service.durationMinutes,
          bufferMinutes: service.bufferMinutes,
        })),
      };
    }

    const manualItems = this.manualItems(dto);
    const serviceIds = manualItems.length
      ? manualItems.map((item) => item.serviceId)
      : dto.serviceIds?.length
        ? dto.serviceIds
        : dto.serviceId
          ? [dto.serviceId]
          : [];
    if (serviceIds.length === 0)
      throw new AppException(
        ErrorCode.BOOKING_SERVICE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );

    const services = await this.serviceCatalog.resolveServicesForBooking(
      locationId,
      serviceIds,
    );
    const executionMode = dto.executionMode
      ? (dto.executionMode as PrismaBookingExecutionMode)
      : PrismaBookingExecutionMode.SEQUENTIAL;
    return {
      bundleId: null,
      bundleTitle: null,
      executionMode,
      services,
    };
  }

  /**
   * Preview without time: prices come through the cache, nothing is stored. Each line is
   * priced with the staff member the request names for it; with none chosen, at the base price.
   */
  private async priceServiceLines(
    locationId: string,
    selection: ResolvedBookingSelection,
    manualItems: ManualBookingItemDto[],
    dto: BookingPricingRequestDto,
  ): Promise<OrderPricingLine[]> {
    const requested = normalizeStaffAssignments(
      selection.services.map((service) => service.id),
      selection.executionMode,
      dto.staffId,
      dto.staffAssignments,
      manualItems,
    );
    const { lines } = await this.pricing.quoteServices(
      locationId,
      {
        bundleId: selection.bundleId,
        lines: selection.services.map((service, index) => {
          const customPrice = manualItems[index]?.customPrice;
          return {
            serviceId: service.id,
            staffId:
              manualItems[index]?.staffId ?? requested.get(service.id) ?? null,
            customPrice:
              customPrice == null ? null : new Prisma.Decimal(customPrice),
          };
        }),
      },
      ReadConsistency.CACHED,
    );
    return selection.services.map((service, index) => {
      const quantity = new Prisma.Decimal(1);
      const price = lines[index];
      return {
        type: OrderItemType.SERVICE,
        catalogItemId: service.id,
        title: service.title,
        sku: null,
        unit: null,
        quantity,
        ...priceLine(
          quantity,
          price.listPrice,
          price.customPrice,
          price.discountTotal,
        ),
      };
    });
  }

  private manualItems(dto: BookingSelectionRequest): ManualBookingItemDto[] {
    return dto.items ?? [];
  }

  private hasServiceSelection(dto: BookingSelectionRequest): boolean {
    return Boolean(
      dto.bundleId ||
      dto.serviceId ||
      dto.serviceIds?.length ||
      dto.items?.length,
    );
  }
}
