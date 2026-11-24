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
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { LocationService } from '../../location/services/location.service.js';
import { OrderPricingLine } from '../../orders/interfaces/order-pricing-line.interface.js';
import { OrdersFacade } from '../../orders/orders.facade.js';
import { PromotionChannel } from '../../pricing/engine/enums/promotion-channel.enum.js';
import { LineDiscountChoice } from '../../pricing/engine/interfaces/line-discount-choice.interface.js';
import { PromoCodeResult } from '../../pricing/engine/interfaces/promo-code-result.interface.js';
import { QuoteContext } from '../../pricing/engine/interfaces/quote-context.interface.js';
import { VisitTime } from '../../pricing/engine/interfaces/visit-time.interface.js';
import { PricingFacade } from '../../pricing/pricing.facade.js';
import { ServiceCatalogFacade } from '../../services/catalog/service-catalog.facade.js';
import { BookingPricingRequestDto } from '../dto/booking-pricing-request.dto.js';
import { ManualBookingItemDto } from '../dto/manual-booking-item.dto.js';
import { BookingPricingAccess } from '../interfaces/booking-pricing-access.interface.js';
import { BookingPricingLine } from '../interfaces/booking-pricing-line.interface.js';
import { BookingPricingResult } from '../interfaces/booking-pricing-result.interface.js';
import { BookingSelectionRequest } from '../interfaces/booking-selection-request.interface.js';
import { ResolvedBookingSelection } from '../interfaces/resolved-booking-selection.interface.js';
import { visitTimeAt } from '../rules/booking-visit-time.rules.js';
import { BookingPricingContextService } from './booking-pricing-context.service.js';

@Injectable()
export class BookingSelectionService {
  constructor(
    private readonly locationService: LocationService,
    private readonly serviceCatalog: ServiceCatalogFacade,
    private readonly orders: OrdersFacade,
    private readonly pricing: PricingFacade,
    private readonly pricingContext: BookingPricingContextService,
  ) {}

  /**
   * Price preview of the booking page, the widget and the booking dialog (cabinet), with
   * promotions and the client discount (docs/pricing-stage4-api.md). Online, a promotion not
   * shown as one is just a lower price: no discount, list price or label.
   */
  async price(
    locationId: string,
    dto: BookingPricingRequestDto,
    access: BookingPricingAccess = { cabinet: false },
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
    // Surcharges and promotions look at the visit start; without one the preview has none.
    const startAt = dto.startAt
      ? TimeUtils.localToUtc(dto.startAt, location.timezone)
      : null;
    const context = selection
      ? await this.pricingContext.build({
          locationId,
          brandId: location.brandId,
          timezone: location.timezone,
          channel: access.cabinet
            ? PromotionChannel.ADMIN
            : PromotionChannel.ONLINE,
          visitStartAt: startAt,
          clientId: access.cabinet ? (dto.clientId ?? null) : null,
          phone: dto.clientPhone ?? null,
          promoCode: dto.promoCode ?? null,
          choice: access.cabinet ? this.discountChoices(dto) : undefined,
        })
      : null;
    const priced = selection
      ? await this.priceServiceLines(
          locationId,
          selection,
          this.manualItems(dto),
          dto,
          startAt ? visitTimeAt(startAt, location.timezone) : null,
          context,
          access,
        )
      : { lines: [], promoCode: null };
    const serviceLines = priced.lines;
    const productLines: BookingPricingLine[] = (
      await this.orders.priceProductItems(locationId, dto.products ?? [])
    ).map((line) => ({ ...line, discount: null, eligible: [], ineligible: [] }));
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
      promoCode: priced.promoCode,
      cabinet: access.cabinet,
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
   * Preview: prices come through the cache, nothing is stored. Each line is priced with the
   * staff member the request names for it (with none chosen, at the base price) and the
   * surcharges of the visit start.
   */
  private async priceServiceLines(
    locationId: string,
    selection: ResolvedBookingSelection,
    manualItems: ManualBookingItemDto[],
    dto: BookingPricingRequestDto,
    visit: VisitTime | null,
    context: QuoteContext | null,
    access: BookingPricingAccess,
  ): Promise<{ lines: BookingPricingLine[]; promoCode: PromoCodeResult | null }> {
    const requested = normalizeStaffAssignments(
      selection.services.map((service) => service.id),
      selection.executionMode,
      dto.staffId,
      dto.staffAssignments,
      manualItems,
    );
    const { lines, promoCode } = await this.pricing.quoteServices(
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
        visit,
        context,
      },
      ReadConsistency.CACHED,
    );
    const items = selection.services.map((service, index): BookingPricingLine => {
      const quantity = new Prisma.Decimal(1);
      const price = lines[index];
      // Online, a promotion not shown as one is the price itself.
      const hidden =
        !access.cabinet &&
        price.discount !== null &&
        price.discount.publicTitle === null;
      return {
        type: OrderItemType.SERVICE,
        catalogItemId: service.id,
        title: service.title,
        sku: null,
        unit: null,
        quantity,
        ...(hidden
          ? priceLine(quantity, price.chargedPrice, price.customPrice)
          : priceLine(
              quantity,
              price.listPrice,
              price.customPrice,
              price.discountTotal,
            )),
        discount: hidden ? null : price.discount,
        eligible: access.cabinet ? price.eligible : [],
        ineligible: access.cabinet ? price.ineligible : [],
      };
    });
    return { lines: items, promoCode };
  }

  /** Discounts picked per line in the booking dialog; a missing one is AUTO. */
  private discountChoices(
    dto: BookingPricingRequestDto,
  ): Record<number, LineDiscountChoice> | undefined {
    const choice: Record<number, LineDiscountChoice> = {};
    this.manualItems(dto).forEach((item, index) => {
      if (item.promotion)
        choice[index] = {
          mode: item.promotion.mode,
          ruleId: item.promotion.ruleId ?? null,
        };
    });
    return Object.keys(choice).length > 0 ? choice : undefined;
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
