import { HttpStatus, Injectable } from '@nestjs/common';
import {
  Location,
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
import { ProductPricingLineView } from '../../orders/interfaces/product-pricing-line-view.interface.js';
import { OrdersFacade } from '../../orders/orders.facade.js';
import { PromotionChannel } from '../../pricing/engine/enums/promotion-channel.enum.js';
import { mergePromoCodeResults } from '../../pricing/engine/promo-code-merge.js';
import { LineDiscountChoice } from '../../pricing/engine/interfaces/line-discount-choice.interface.js';
import { PromoCodeResult } from '../../pricing/engine/interfaces/promo-code-result.interface.js';
import { QuoteContext } from '../../pricing/engine/interfaces/quote-context.interface.js';
import { PriceBook } from '../../pricing/engine/price-book.js';
import { PricingFacade } from '../../pricing/pricing.facade.js';
import { ServiceCatalogFacade } from '../../services/catalog/service-catalog.facade.js';
import { BookingPricingRequestDto } from '../dto/booking-pricing-request.dto.js';
import { ManualBookingItemDto } from '../dto/manual-booking-item.dto.js';
import { BookingPricingAccess } from '../interfaces/booking-pricing-access.interface.js';
import { BookingPricingLine } from '../interfaces/booking-pricing-line.interface.js';
import { BookingPricingResult } from '../interfaces/booking-pricing-result.interface.js';
import { BookingSelectionRequest } from '../interfaces/booking-selection-request.interface.js';
import { ResolvedBookingSelection } from '../interfaces/resolved-booking-selection.interface.js';
import { repeatedDiscountChoice } from '../rules/booking-discount-choice.rules.js';
import { visitTimeAt } from '../rules/booking-visit-time.rules.js';
import { PricingContextService } from '../../pricing/services/pricing-context.service.js';
import { StaffService } from '../../staff/services/staff.service.js';
import { BookingLineStaffSource } from '../enums/booking-line-staff-source.enum.js';
import { BookingTeamRequest } from '../interfaces/booking-team-request.interface.js';
import { BookingReadService } from './read/booking-read.service.js';
import { BookingSchedulingService } from './booking-scheduling.service.js';

@Injectable()
export class BookingSelectionService {
  constructor(
    private readonly locationService: LocationService,
    private readonly serviceCatalog: ServiceCatalogFacade,
    private readonly orders: OrdersFacade,
    private readonly pricing: PricingFacade,
    private readonly pricingContext: PricingContextService,
    private readonly bookings: BookingReadService,
    private readonly scheduling: BookingSchedulingService,
    private readonly staff: StaffService,
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
          choice: access.cabinet
            ? await this.discountChoices(locationId, dto, selection)
            : undefined,
          bookingId: access.cabinet ? (dto.bookingId ?? null) : null,
        })
      : null;
    const priced = selection
      ? await this.priceServiceLines(
          locationId,
          location,
          selection,
          this.manualItems(dto),
          dto,
          startAt,
          context,
          access,
        )
      : { lines: [], promoCode: null, listTotal: new Prisma.Decimal(0) };
    const serviceLines = priced.lines;
    const products = await this.priceProductLines(
      locationId,
      location,
      dto,
      startAt,
      priced.listTotal,
      access,
    );
    const productLines = products.lines;
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
      // A code that applies only to products counts too (docs/pricing-stage7-api.md).
      promoCode: mergePromoCodeResults(priced.promoCode, products.promoCode),
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
   * staff member the request names for it, else the one booking creation would assign
   * (previewTeam), and the surcharges of the visit start.
   */
  private async priceServiceLines(
    locationId: string,
    location: Location,
    selection: ResolvedBookingSelection,
    manualItems: ManualBookingItemDto[],
    dto: BookingPricingRequestDto,
    startAt: Date | null,
    context: QuoteContext | null,
    access: BookingPricingAccess,
  ): Promise<{
    lines: BookingPricingLine[];
    promoCode: PromoCodeResult | null;
    /** Σ listPrice of the services: the visit total product promotions compare with. */
    listTotal: Prisma.Decimal;
  }> {
    // One snapshot ranks the staff and quotes the lines, as on creation.
    const book = await this.pricing.priceBook(
      locationId,
      ReadConsistency.CACHED,
    );
    const team = await this.previewTeam(
      book,
      locationId,
      location,
      selection,
      manualItems,
      dto,
      startAt,
      context,
      access,
    );
    const staffNames = await this.staff.namesByIds(
      [...new Set(team.staffIds)].filter((id): id is string => id !== null),
    );
    const visit = startAt ? visitTimeAt(startAt, location.timezone) : null;
    const { lines, promoCode } = this.pricing.quoteWithBook(book, {
      bundleId: selection.bundleId,
      lines: selection.services.map((service, index) => {
        const customPrice = manualItems[index]?.customPrice;
        return {
          serviceId: service.id,
          staffId: team.staffIds[index],
          customPrice:
            customPrice == null ? null : new Prisma.Decimal(customPrice),
        };
      }),
      visit,
      context,
    });
    const items = selection.services.map(
      (service, index): BookingPricingLine => {
        const quantity = new Prisma.Decimal(1);
        const price = lines[index];
        const staffId = team.staffIds[index];
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
          staffId,
          staffName: staffId ? (staffNames.get(staffId) ?? null) : null,
          staffSource: staffId ? team.source[index] : null,
        };
      },
    );
    return {
      lines: items,
      promoCode,
      listTotal: lines.reduce(
        (sum, line) => sum.plus(line.listPrice),
        new Prisma.Decimal(0),
      ),
    };
  }

  /**
   * Staff of each service line for the preview: the one the request names, else the one
   * booking creation assigns with the same request (BookingSchedulingService.assignTeam:
   * the same candidates, availability, ranking and preferred staff), so the preview shows
   * the price the booking gets. Nobody free at the start: the rule ignoring availability
   * (ESTIMATED), creation then refuses that start. Without a start: the rule among all
   * qualified staff (ESTIMATED). No complete team at all, or a named staff member who does
   * not perform the service: lines without a staff member keep the base price, and creation
   * refuses the request.
   */
  private async previewTeam(
    book: PriceBook,
    locationId: string,
    location: Location,
    selection: ResolvedBookingSelection,
    manualItems: ManualBookingItemDto[],
    dto: BookingPricingRequestDto,
    startAt: Date | null,
    context: QuoteContext | null,
    access: BookingPricingAccess,
  ): Promise<{
    staffIds: (string | null)[];
    source: BookingLineStaffSource[];
  }> {
    const requested = normalizeStaffAssignments(
      selection.services.map((service) => service.id),
      selection.executionMode,
      dto.staffId,
      dto.staffAssignments,
      manualItems,
    );
    const named = selection.services.map(
      (service, index) =>
        manualItems[index]?.staffId ?? requested.get(service.id) ?? null,
    );
    const sourced = (other: BookingLineStaffSource) =>
      named.map((id) => (id ? BookingLineStaffSource.REQUESTED : other));
    if (named.every((id) => id !== null))
      return {
        staffIds: named,
        source: sourced(BookingLineStaffSource.REQUESTED),
      };
    const isCustomTime = access.cabinet && dto.isCustomTime === true;
    const request: BookingTeamRequest = {
      locationId,
      bundleId: selection.bundleId,
      services: selection.services,
      prices: ReadConsistency.CACHED,
      startAt,
      executionMode: selection.executionMode,
      requestedStaffId: dto.staffId,
      staffAssignments: dto.staffAssignments,
      timezone: location.timezone,
      manualItems,
      customEndAt:
        isCustomTime && dto.endAt
          ? TimeUtils.localToUtc(dto.endAt, location.timezone)
          : null,
      allowConflicts: isCustomTime,
      preferredStaffId: access.ownStaffId,
      staffRule: location.anyStaffRule,
      pricingContext: context,
      book,
    };
    const assigned = await this.assignTeam(request);
    if (assigned && startAt)
      return {
        staffIds: assigned,
        source: sourced(BookingLineStaffSource.ASSIGNED),
      };
    const estimated =
      assigned ??
      (startAt && !isCustomTime
        ? await this.assignTeam({ ...request, allowConflicts: true })
        : null);
    return {
      staffIds: estimated ?? named,
      source: sourced(BookingLineStaffSource.ESTIMATED),
    };
  }

  /** The team, or null when creation would refuse the request for its staff or interval. */
  private async assignTeam(
    request: BookingTeamRequest,
  ): Promise<string[] | null> {
    try {
      return await this.scheduling.assignTeam(request);
    } catch (error) {
      if (
        error instanceof AppException &&
        (error.errorCode === ErrorCode.BOOKING_STAFF_NOT_FOUND.code ||
          error.errorCode === ErrorCode.BOOKING_INVALID_INTERVAL.code)
      )
        return null;
      throw error;
    }
  }

  /**
   * Products of the booking window priced in the context of the booking, as the visit order
   * prices them after creation (docs/pricing-stage7-api.md, «Предпросмотр окна записи»): the
   * visit start, the channel by access, the client, the promo code and the picks (cabinet);
   * with bookingId, the confirmed products of its order count in the visit total and its own
   * promotion use is not counted. Discount layer, pick and purchase price are cabinet only.
   */
  private async priceProductLines(
    locationId: string,
    location: { brandId: string; timezone: string },
    dto: BookingPricingRequestDto,
    startAt: Date | null,
    servicesListTotal: Prisma.Decimal,
    access: BookingPricingAccess,
  ): Promise<{
    lines: BookingPricingLine[];
    promoCode: PromoCodeResult | null;
  }> {
    const products = dto.products ?? [];
    if (products.length === 0) return { lines: [], promoCode: null };
    const bookingId = access.cabinet ? (dto.bookingId ?? null) : null;
    // The booking period counts from the day the edited booking was made.
    const bookedAt = bookingId
      ? (await this.bookings.findByIdInLocation(locationId, bookingId))
          .createdAt
      : new Date();
    const { lines, quote } = await this.orders.priceVisitProducts(
      locationId,
      { brandId: location.brandId, timezone: location.timezone },
      {
        bookingId,
        startAt,
        bookedAt,
        channel: access.cabinet
          ? PromotionChannel.ADMIN
          : PromotionChannel.ONLINE,
        clientId: access.cabinet ? (dto.clientId ?? null) : null,
        phone: dto.clientPhone ?? null,
        promoCode: dto.promoCode ?? null,
        servicesListTotal,
      },
      products.map((product) =>
        access.cabinet ? product : { ...product, promotion: undefined },
      ),
      ReadConsistency.CACHED,
      {
        canReadPurchaseCost:
          access.cabinet && access.canReadPurchaseCost === true,
      },
    );
    return {
      lines: lines.map((line) => this.productLine(line, access.cabinet)),
      promoCode: quote.promoCode,
    };
  }

  private productLine(
    line: ProductPricingLineView,
    cabinet: boolean,
  ): BookingPricingLine {
    const { price } = line;
    return {
      type: OrderItemType.PRODUCT,
      catalogItemId: line.productId,
      title: line.title,
      sku: line.sku,
      unit: line.unit,
      quantity: line.quantity,
      listUnitPrice: price.listUnitPrice,
      listLineTotal: price.listLineTotal,
      customUnitPrice: price.customUnitPrice,
      unitPrice: price.unitPrice,
      lineSubtotal: price.lineSubtotal,
      discountTotal: price.discountTotal,
      lineTotal: price.lineTotal,
      discount: price.discount,
      eligible: cabinet ? price.eligible : [],
      ineligible: cabinet ? price.ineligible : [],
      adjustments: cabinet ? price.adjustments : [],
      promotion: cabinet ? line.promotion : null,
      lastPurchaseUnitCost: cabinet ? line.lastPurchaseUnitCost : null,
      belowCost: cabinet && line.belowCost,
    };
  }

  /**
   * Discounts picked per line in the booking dialog; a missing one is AUTO. Editing a booking
   * (bookingId), a line without a pick takes the stored pick of the booking item at the same
   * position with the same service, which falls back to the best discount when it no longer
   * applies (docs/pricing-stage5-api.md). Lines are the selected services in order, so a
   * bundle (no items) gets the stored picks too, as the repricing of the booking does.
   */
  private async discountChoices(
    locationId: string,
    dto: BookingPricingRequestDto,
    selection: ResolvedBookingSelection,
  ): Promise<Record<number, LineDiscountChoice> | undefined> {
    const stored = dto.bookingId
      ? await this.bookings.findDiscountChoices(locationId, dto.bookingId)
      : [];
    const manualItems = this.manualItems(dto);
    const choice: Record<number, LineDiscountChoice> = {};
    selection.services.forEach((service, index) => {
      const promotion = manualItems[index]?.promotion;
      const booked = stored[index];
      const picked = promotion
        ? { mode: promotion.mode, ruleId: promotion.ruleId ?? null }
        : booked?.serviceId === service.id
          ? repeatedDiscountChoice(booked)
          : undefined;
      if (picked) choice[index] = picked;
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
