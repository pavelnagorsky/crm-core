import { HttpStatus, Injectable } from '@nestjs/common';
import {
  OrderItemType,
  Prisma,
  BookingExecutionMode as PrismaBookingExecutionMode,
} from '@prisma/client';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { priceLine, sumPrices } from '../../../shared/money/line-pricing.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { LocationService } from '../../location/services/location.service.js';
import { OrderPricingLine } from '../../orders/interfaces/order-pricing-line.interface.js';
import { OrdersFacade } from '../../orders/orders.facade.js';
import { ServiceBundleService } from '../../services/catalog/service-bundle.service.js';
import { ServicesService } from '../../services/services.service.js';
import { BookingPricingRequestDto } from '../dto/booking-pricing-request.dto.js';
import { ManualBookingItemDto } from '../dto/manual-booking-item.dto.js';
import { BookingPricingResult } from '../interfaces/booking-pricing-result.interface.js';
import { BookingSelectionRequest } from '../interfaces/booking-selection-request.interface.js';
import { BookingServiceSnapshot } from '../interfaces/booking-service-snapshot.interface.js';
import { ResolvedBookingSelection } from '../interfaces/resolved-booking-selection.interface.js';

@Injectable()
export class BookingSelectionService {
  constructor(
    private readonly locationService: LocationService,
    private readonly servicesService: ServicesService,
    private readonly serviceBundles: ServiceBundleService,
    private readonly orders: OrdersFacade,
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
      ? this.priceServiceLines(selection.services, this.manualItems(dto))
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
      const bundle = await this.serviceBundles.resolveActiveForBooking(
        locationId,
        dto.bundleId,
      );
      if (bundle.items.length === 0)
        throw new AppException(
          ErrorCode.BOOKING_SERVICE_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      const services = bundle.items.map((item) => item.service);
      const prices = this.bundleItemPrices(
        services.map((service) => service.price),
        bundle.pricingMode,
        bundle.fixedPrice,
      );
      return {
        bundleId: bundle.id,
        bundleTitle: bundle.title,
        executionMode: bundle.executionMode,
        services: services.map((service, index) => ({
          id: service.id,
          title: service.title,
          durationMinutes: service.durationMinutes,
          bufferMinutes: service.bufferMinutes,
          price: prices[index],
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

    const services = await this.servicesService.resolveActiveForBooking(
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

  private priceServiceLines(
    services: BookingServiceSnapshot[],
    manualItems: ManualBookingItemDto[],
  ): OrderPricingLine[] {
    return services.map((service, index) => {
      const quantity = new Prisma.Decimal(1);
      const price = priceLine(
        quantity,
        service.price,
        manualItems[index]?.customPrice == null
          ? null
          : new Prisma.Decimal(manualItems[index].customPrice),
      );
      return {
        type: OrderItemType.SERVICE,
        catalogItemId: service.id,
        title: service.title,
        sku: null,
        unit: null,
        quantity,
        ...price,
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

  private bundleItemPrices(
    servicePrices: Prisma.Decimal[],
    pricingMode: string,
    fixedPrice: Prisma.Decimal | null,
  ): Prisma.Decimal[] {
    if (pricingMode !== 'FIXED') return servicePrices;
    if (!fixedPrice)
      throw new AppException(
        ErrorCode.BUNDLE_FIXED_PRICE_REQUIRED,
        HttpStatus.BAD_REQUEST,
      );
    const total = servicePrices.reduce(
      (sum, price) => sum.plus(price),
      new Prisma.Decimal(0),
    );
    if (total.equals(0)) {
      const share = MoneyUtils.quantize(fixedPrice.div(servicePrices.length));
      return servicePrices.map((_, index) =>
        index === servicePrices.length - 1
          ? fixedPrice.minus(share.mul(servicePrices.length - 1))
          : share,
      );
    }
    let allocated = new Prisma.Decimal(0);
    return servicePrices.map((price, index) => {
      if (index === servicePrices.length - 1)
        return fixedPrice.minus(allocated);
      const share = MoneyUtils.quantize(fixedPrice.mul(price).div(total));
      allocated = allocated.plus(share);
      return share;
    });
  }
}
