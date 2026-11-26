import {
  BadRequestException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { BookingVisibility, Client, Prisma } from '@prisma/client';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { MoneyUtils } from '../../shared/money/money.utils.js';
import { TimeUtils } from '../../shared/time/time.utils.js';
import { ReadConsistency } from '../../shared/cache/enums/read-consistency.enum.js';
import { ErrorCode } from '../../shared/validation/error-codes.enum.js';
import { AuditActorRole } from '../audit/enums/audit-actor-role.enum.js';
import { AuditActor } from '../audit/interfaces/audit-actor.interface.js';
import { BillingFacade } from '../billing/billing.facade.js';
import { ClientsService } from '../clients/services/clients.service.js';
import { LocationService } from '../location/services/location.service.js';
import { StaffBookingEvent } from '../notifications/enums/staff-booking-event.enum.js';
import { PriceAdjustmentKind } from '../pricing/engine/enums/price-adjustment-kind.enum.js';
import { PromoCodeStatus } from '../pricing/engine/enums/promo-code-status.enum.js';
import { PromotionChannel } from '../pricing/engine/enums/promotion-channel.enum.js';
import { LineDiscountChoice } from '../pricing/engine/interfaces/line-discount-choice.interface.js';
import { PromoCodeResult } from '../pricing/engine/interfaces/promo-code-result.interface.js';
import { mergePromoCodeResults } from '../pricing/engine/promo-code-merge.js';
import { ServicePriceAdjustment } from '../pricing/interfaces/service-price-adjustment.interface.js';
import { BookingPricingRequestDto } from './dto/booking-pricing-request.dto.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';
import { ManualBookingItemDto } from './dto/manual-booking-item.dto.js';
import { ManualBookingProductDto } from './dto/manual-booking-product.dto.js';
import { ManualCreateBookingDto } from './dto/manual-create-booking.dto.js';
import { PublicCreateBookingDto } from './dto/public-create-booking.dto.js';
import { BookingChannel } from './enums/booking-channel.enum.js';
import { BookingStatus } from './enums/booking-status.enum.js';
import { ResolvedBookingChannel } from './interfaces/resolved-booking-channel.interface.js';
import { ResolvedBookingItem } from './interfaces/resolved-booking-item.interface.js';
import { ClassifiedTraffic } from '../../shared/traffic/interfaces/classified-traffic.interface.js';
import { editTrafficSource } from '../../shared/traffic/rules/traffic-source-edit.rules.js';
import { BookingTraffic } from './interfaces/booking-traffic.interface.js';
import { BookingCreationOutcome } from './interfaces/booking-creation-outcome.interface.js';
import { BookingCreationResult } from './interfaces/booking-creation-result.interface.js';
import { BookingCreationRequest } from './interfaces/booking-creation-request.interface.js';
import { BookingPricingAccess } from './interfaces/booking-pricing-access.interface.js';
import { BookingPricingResult } from './interfaces/booking-pricing-result.interface.js';
import { BookingSelectionRequest } from './interfaces/booking-selection-request.interface.js';
import { BookingWithItems } from './interfaces/booking-with-items.interface.js';
import { PublicBookingRequestContext } from './interfaces/public-booking-request-context.interface.js';
import { ResolvedBookingClient } from './interfaces/resolved-booking-client.interface.js';
import { canHaveStatus } from './rules/booking-initial-status.rules.js';
import { isSelfBookingBlocked } from './rules/client-ban.rules.js';
import { bookingRequestHash } from './rules/booking-request-hash.js';
import {
  createdClientNotice,
  NO_CLIENT_NOTICE,
} from './rules/booking-client-notice.rules.js';
import { BookingEventsService } from './services/booking-events.service.js';
import { PricingContextService } from '../pricing/services/pricing-context.service.js';
import { BookingReservationService } from './services/booking-reservation.service.js';
import { BookingSchedulingService } from './services/booking-scheduling.service.js';
import { BookingSelectionService } from './services/booking-selection.service.js';
import { PublicBookingRateLimiter } from './services/public-booking-rate-limiter.js';
import { BookingPaymentService } from './services/write/booking-payment.service.js';
import { OrdersFacade } from '../orders/orders.facade.js';
import { VisitPaymentPlan } from './interfaces/visit-payment-plan.interface.js';
import { completesOnPayment } from './rules/visit-payment-due.rules.js';

@Injectable()
export class BookingCreateFacade {
  private readonly logger = new Logger(BookingCreateFacade.name);
  constructor(
    private readonly clientsService: ClientsService,
    private readonly rateLimiter: PublicBookingRateLimiter,
    private readonly locationService: LocationService,
    private readonly selection: BookingSelectionService,
    private readonly scheduling: BookingSchedulingService,
    private readonly events: BookingEventsService,
    private readonly reservations: BookingReservationService,
    private readonly billing: BillingFacade,
    private readonly bookingPayment: BookingPaymentService,
    private readonly orders: OrdersFacade,
    private readonly pricingContext: PricingContextService,
  ) {}

  async createPublicBooking(
    locationId: string,
    dto: PublicCreateBookingDto,
    attribution: ResolvedBookingChannel,
    traffic: ClassifiedTraffic,
    context: PublicBookingRequestContext = { ip: 'unknown' },
  ): Promise<BookingWithItems> {
    this.assertPublicClientFields(dto);
    await this.assertOnlineBookingOpen(locationId);
    await this.rateLimiter.assertAllowed(dto.phone, context.ip);
    const request: BookingCreationRequest | undefined = dto.idempotencyKey
      ? {
          idempotencyKey: dto.idempotencyKey.toLowerCase(),
          creationRequestHash: bookingRequestHash(locationId, dto, attribution),
        }
      : undefined;
    const result: BookingCreationOutcome = request
      ? await this.reservations.reserveOnce(locationId, request, (tx) =>
          this.create(
            locationId,
            attribution,
            traffic,
            null,
            dto,
            undefined,
            tx,
            request,
          ),
        )
      : {
          // One transaction, so the limited promotions stay locked until the booking is stored.
          ...(await this.reservations.createInTransaction(locationId, (tx) =>
            this.create(
              locationId,
              attribution,
              traffic,
              null,
              dto,
              undefined,
              tx,
            ),
          )),
          created: true,
        };
    if (!result.created) return result.booking;
    const { booking, timezone, currency, bundleTitle } = result;
    this.logger.log(
      `booking created (public): id=${booking.id} locationId=${locationId} channel=${booking.channel} items=${booking.items.length} bundleId=${booking.bundleId ?? '-'} startAt=${booking.startAt.toISOString()}`,
    );
    const actor: AuditActor = {
      name: [booking.clientFirstName, booking.clientLastName]
        .filter((part) => part.trim())
        .join(' '),
      role: AuditActorRole.CLIENT,
    };
    this.events.created(booking, actor, currency, bundleTitle);
    this.events.notifyCreated(booking, timezone);
    this.events.notifyStaff(
      booking,
      booking.status === BookingStatus.PENDING
        ? StaffBookingEvent.REQUESTED
        : StaffBookingEvent.CREATED,
    );
    return booking;
  }

  async createManualBooking(
    locationId: string,
    dto: ManualCreateBookingDto,
    actor: AuditActor,
    ownStaffId?: string,
    canOverridePrice = false,
  ): Promise<BookingWithItems> {
    if (dto.anonymous === true && dto.clientId)
      throw new AppException(
        ErrorCode.BOOKING_CLIENT_CONFLICT,
        HttpStatus.BAD_REQUEST,
      );
    // A new booking has no payment to replace.
    const paymentPlan = await this.bookingPayment.plan(
      locationId,
      {
        payment: dto.payment,
        confirmAllDraftProducts:
          dto.confirmProducts === true && (dto.products?.length ?? 0) > 0,
        expectedProductTotal: dto.expectedProductTotal,
      },
      false,
    );
    const { booking, currency, bundleTitle, productsAdded, payment } =
      await this.create(
        locationId,
        {
          channel: BookingChannel.MANUAL,
          bookingPageId: null,
          bookingWidgetId: null,
        },
        this.manualTraffic(dto),
        actor,
        dto,
        ownStaffId,
        undefined,
        undefined,
        paymentPlan,
        canOverridePrice,
      );
    this.logger.log(
      `booking created (manual): id=${booking.id} locationId=${locationId} channel=${booking.channel} items=${booking.items.length} bundleId=${booking.bundleId ?? '-'} actor=${actor.name}`,
    );
    this.events.created(booking, actor, currency, bundleTitle);
    if (productsAdded)
      this.orders.publishDraftProductsAdded(productsAdded, actor);
    if (payment) await this.bookingPayment.publish(payment, actor);
    return booking;
  }

  price(
    locationId: string,
    dto: BookingPricingRequestDto,
    access: BookingPricingAccess = { cabinet: false },
  ): Promise<BookingPricingResult> {
    return this.selection.price(locationId, dto, access);
  }

  private async create(
    locationId: string,
    attribution: ResolvedBookingChannel,
    traffic: BookingTraffic,
    actor: AuditActor | null,
    dto: CreateBookingDto | ManualCreateBookingDto,
    ownStaffId?: string,
    tx?: Prisma.TransactionClient,
    request?: BookingCreationRequest,
    paymentPlan: VisitPaymentPlan | null = null,
    canOverridePrice = false,
  ): Promise<BookingCreationResult> {
    const location = await this.locationService.findById(locationId);
    if (!location)
      throw new AppException(
        ErrorCode.BOOKING_BUSINESS_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    if (
      !this.isInternalChannel(attribution.channel) &&
      location.bookingVisibility === BookingVisibility.PRIVATE
    ) {
      throw new AppException(
        ErrorCode.BOOKING_NOT_AVAILABLE,
        HttpStatus.FORBIDDEN,
      );
    }

    const startAt = TimeUtils.localToUtc(dto.startAt, location.timezone);
    const internal = this.isInternalChannel(attribution.channel);
    const requestedStatus =
      internal && 'status' in dto ? dto.status : undefined;
    if (requestedStatus && !canHaveStatus(requestedStatus, startAt, new Date()))
      throw new AppException(
        ErrorCode.BOOKING_STATUS_BEFORE_START,
        HttpStatus.BAD_REQUEST,
      );
    const publicClient = internal
      ? null
      : await this.resolveBookingClient(
          location.brandId,
          attribution.channel,
          dto,
        );
    if (
      publicClient &&
      isSelfBookingBlocked(attribution.channel, publicClient.client.bannedAt)
    )
      throw new AppException(ErrorCode.CLIENT_BANNED, HttpStatus.FORBIDDEN);

    const selection = await this.selection.resolveForBooking(locationId, dto);
    const isCustomTime =
      internal && 'isCustomTime' in dto && dto.isCustomTime === true;
    const customEndAt =
      isCustomTime && 'endAt' in dto && dto.endAt
        ? TimeUtils.localToUtc(dto.endAt, location.timezone)
        : null;
    // Online, the limited promotions are locked and counted in the booking transaction; a
    // manual booking re-checks the limits it uses under the location lock (limitGuard).
    const pricingContext = await this.pricingContext.build({
      locationId,
      brandId: location.brandId,
      timezone: location.timezone,
      channel: internal ? PromotionChannel.ADMIN : PromotionChannel.ONLINE,
      visitStartAt: startAt,
      clientId: internal && 'clientId' in dto ? (dto.clientId ?? null) : null,
      phone: this.isAnonymousManualBooking(attribution.channel, dto)
        ? null
        : (dto.phone ?? null),
      promoCode: dto.promoCode ?? null,
      choice: internal ? this.discountChoices(dto) : undefined,
      tx: internal ? undefined : tx,
    });
    const scheduled = await this.scheduling.schedule({
      locationId,
      bundleId: selection.bundleId,
      services: selection.services,
      // The booking fixes its prices, so they are read fresh, never from a stale cache.
      prices: ReadConsistency.FRESH,
      startAt,
      executionMode: selection.executionMode,
      requestedStaffId: dto.staffId,
      staffAssignments: dto.staffAssignments,
      timezone: location.timezone,
      manualItems: this.manualItems(dto),
      customEndAt,
      // Custom time is the journal's "book anyway": the staff member's schedule is not checked.
      allowConflicts: isCustomTime,
      // A master booking for themselves takes the services they can do; colleagues the rest.
      preferredStaffId: ownStaffId,
      // The staff member the guest saw with the slot, or the booking dialog showed.
      preferredStaffIds: (
        dto as PublicCreateBookingDto | ManualCreateBookingDto
      ).preferredStaffIds,
      // Read from the fresh location, so a rule change is applied to the very next booking.
      staffRule: location.anyStaffRule,
      pricingContext,
    });
    const items = scheduled.items;
    // The guest (or the administrator, who sends the total of the dialog) agreed to a total;
    // a price edited meanwhile or another staff member must be confirmed again.
    if (!internal || ('expectedTotal' in dto && dto.expectedTotal != null))
      this.assertExpectedTotal(dto, items, scheduled.promoCode);
    // The booking dialog saves the staff it showed: another one is confirmed again too.
    if (internal)
      this.assertPreferredStaff(
        (dto as ManualCreateBookingDto).preferredStaffIds,
        items,
        dto,
        scheduled.promoCode,
      );
    if (ownStaffId && !items.some((item) => item.staffId === ownStaffId))
      throw new AppException(
        ErrorCode.BOOKING_OWN_STAFF_REQUIRED,
        HttpStatus.FORBIDDEN,
      );
    const envelopeStart = new Date(
      Math.min(...items.map((item) => item.startAt.getTime())),
    );
    const envelopeEnd = new Date(
      Math.max(...items.map((item) => item.endAt.getTime())),
    );
    // Confirmation is for online requests; staff booking from the journal has already agreed.
    // A completed status needs no permission beyond creating the booking, as on a status change.
    const plannedStatus =
      requestedStatus ??
      this.initialStatus(
        isCustomTime,
        envelopeEnd,
        location.isBookingConfirmationRequired && !internal,
      );
    // Paying a visit that has started completes it, as on an existing booking.
    const status =
      paymentPlan?.payment &&
      completesOnPayment(
        { status: plannedStatus, startAt: envelopeStart },
        paymentPlan.now,
      )
        ? BookingStatus.COMPLETED
        : plannedStatus;
    const { client: resolved, picked } =
      publicClient ??
      (await this.resolveBookingClient(
        location.brandId,
        attribution.channel,
        dto,
      ));
    // Staff may add the missing email of a client they picked; it is saved with the booking.
    const emailToFill = picked && !picked.email && dto.email ? dto.email : null;
    const client = emailToFill ? { ...resolved, email: emailToFill } : resolved;
    const notifyClient = internal
      ? (('notifyClient' in dto ? dto.notifyClient : undefined) ??
        location.notifyClientOnStaffChanges)
      : true;
    // Online bookings email the client at once; staff ones wait, so a mistake can be undone first.
    const clientNotice = internal
      ? createdClientNotice(
          {
            status,
            startAt: envelopeStart,
            clientEmail: client.email,
            notifyClient,
          },
          new Date(),
        )
      : NO_CLIENT_NOTICE;

    const products = this.manualProducts(dto, attribution.channel);
    // Products are priced in the context of the new booking before it is written: a promo
    // code that applies only to them is kept with the booking (docs/pricing-stage7-api.md).
    const productQuote =
      products.length > 0
        ? (
            await this.orders.priceVisitProducts(
              locationId,
              { brandId: location.brandId, timezone: location.timezone },
              {
                bookingId: null,
                startAt: envelopeStart,
                bookedAt: new Date(),
                channel: PromotionChannel.ADMIN,
                clientId: client.id,
                promoCode: dto.promoCode ?? null,
                servicesListTotal: items.reduce(
                  (sum, item) => sum.plus(item.listPrice),
                  new Prisma.Decimal(0),
                ),
              },
              products,
              ReadConsistency.FRESH,
              { canReadPurchaseCost: false },
            )
          ).quote
        : null;
    const promoCode = mergePromoCodeResults(
      scheduled.promoCode,
      productQuote?.promoCode ?? null,
    );
    const { booking, productsAdded, payment } = await this.reservations.reserve(
      {
        locationId,
        timezone: location.timezone,
        client,
        clientEmailToFill: emailToFill,
        items,
        attribution,
        traffic,
        executionMode: selection.executionMode,
        bundleId: selection.bundleId,
        startAt: envelopeStart,
        endAt: envelopeEnd,
        status,
        isCustomTime,
        notifyClient,
        clientNotice,
        notes: dto.notes ?? null,
        internalNotes: this.manualInternalNotes(dto, attribution.channel),
        products,
        canOverridePrice,
        actor,
        request,
        paymentPlan,
        promoCode:
          promoCode?.status === PromoCodeStatus.APPLIED ? promoCode.code : null,
        limitGuard: internal
          ? (guardTx) =>
              this.pricingContext.assertLimitsHeld(
                guardTx,
                locationId,
                // Services and products together (docs/pricing-stage7-api.md).
                [
                  ...items.flatMap((item) =>
                    this.promotionRuleIds(item.priceAdjustments),
                  ),
                  ...(productQuote?.lines ?? []).flatMap((line) =>
                    this.promotionRuleIds(line.adjustments),
                  ),
                ],
                client.id,
                envelopeStart,
              )
          : undefined,
      },
      tx,
    );
    // A picked client exists only on manual bookings, which commit their own transaction.
    if (picked && emailToFill && actor && booking.clientEmail === emailToFill)
      this.clientsService.emitEmailFilled(
        location.brandId,
        picked,
        emailToFill,
        actor,
      );

    return {
      booking,
      timezone: location.timezone,
      currency: location.currency,
      bundleTitle: selection.bundleTitle,
      productsAdded,
      payment,
    };
  }

  /**
   * An online guest (or the booking dialog, with expectedTotal) books at the total they saw.
   * If the recalculated total differs, nothing is created and the client retries with the
   * new total (409 PRICE_CHANGED).
   */
  private assertExpectedTotal(
    dto: CreateBookingDto,
    items: ResolvedBookingItem[],
    promoCode: PromoCodeResult | null,
  ): void {
    const expected =
      'expectedTotal' in dto && typeof dto.expectedTotal === 'string'
        ? dto.expectedTotal
        : null;
    const recount = this.recount(expected, items, promoCode);
    if (expected !== null && new Prisma.Decimal(recount.total).equals(expected))
      return;
    throw new AppException(
      ErrorCode.PRICE_CHANGED,
      HttpStatus.CONFLICT,
      recount,
    );
  }

  /**
   * The booking dialog sends the staff it showed (preferredStaffIds). One of them was taken
   * meanwhile and the rule gave another at the same total: 409 BOOKING_STAFF_CHANGED with the
   * recounted team, nothing is created; the dialog shows the new staff and saves again. A
   * different total is PRICE_CHANGED first.
   */
  private assertPreferredStaff(
    preferredStaffIds: string[] | undefined,
    items: ResolvedBookingItem[],
    dto: CreateBookingDto,
    promoCode: PromoCodeResult | null,
  ): void {
    if (!preferredStaffIds?.length) return;
    const changed = items.some(
      (item, index) =>
        preferredStaffIds[index] !== undefined &&
        preferredStaffIds[index] !== item.staffId,
    );
    if (!changed) return;
    const expected =
      'expectedTotal' in dto && typeof dto.expectedTotal === 'string'
        ? dto.expectedTotal
        : null;
    throw new AppException(
      ErrorCode.BOOKING_STAFF_CHANGED,
      HttpStatus.CONFLICT,
      this.recount(expected, items, promoCode),
    );
  }

  /** Payload of PRICE_CHANGED and BOOKING_STAFF_CHANGED: the recounted services. */
  private recount(
    expectedTotal: string | null,
    items: ResolvedBookingItem[],
    promoCode: PromoCodeResult | null,
  ) {
    const total = items.reduce(
      (sum, item) => sum.plus(item.customPrice ?? item.chargedPrice),
      new Prisma.Decimal(0),
    );
    return {
      expectedTotal,
      total: MoneyUtils.format(total),
      items: items.map((item) => ({
        serviceId: item.serviceId,
        serviceTitle: item.serviceTitle,
        staffId: item.staffId,
        staffName: item.staffName,
        price: MoneyUtils.format(item.customPrice ?? item.chargedPrice),
      })),
      promoCode,
    };
  }

  private promotionRuleIds(
    adjustments: readonly Pick<ServicePriceAdjustment, 'kind' | 'ruleId'>[],
  ): (string | null)[] {
    return adjustments
      .filter(
        (adjustment) =>
          (adjustment.kind as string) === PriceAdjustmentKind.PROMOTION,
      )
      .map((adjustment) => adjustment.ruleId);
  }

  /** Discounts picked per line in the booking dialog; a missing one is AUTO. */
  private discountChoices(
    dto: CreateBookingDto | ManualCreateBookingDto,
  ): Record<number, LineDiscountChoice> | undefined {
    const items = 'items' in dto ? (dto.items ?? []) : [];
    const choice: Record<number, LineDiscountChoice> = {};
    items.forEach((item, index) => {
      if (item.promotion)
        choice[index] = {
          mode: item.promotion.mode,
          ruleId: item.promotion.ruleId ?? null,
        };
    });
    return Object.keys(choice).length > 0 ? choice : undefined;
  }

  /** The source staff picked for a manual booking; a detail alone is rejected. */
  private manualTraffic(dto: ManualCreateBookingDto): BookingTraffic {
    const picked = editTrafficSource(
      { source: null, detail: null },
      dto.trafficSource,
      dto.trafficSourceDetail,
    );
    return { ...picked, touch: null };
  }

  private manualItems(dto: BookingSelectionRequest): ManualBookingItemDto[] {
    return dto.items ?? [];
  }

  private manualProducts(
    dto: CreateBookingDto | ManualCreateBookingDto,
    channel: BookingChannel,
  ): ManualBookingProductDto[] {
    if (!this.isInternalChannel(channel) || !('products' in dto)) return [];
    return dto.products ?? [];
  }

  private manualInternalNotes(
    dto: CreateBookingDto | ManualCreateBookingDto,
    channel: BookingChannel,
  ): string | null {
    if (!this.isInternalChannel(channel) || !('internalNotes' in dto))
      return null;
    return dto.internalNotes ?? null;
  }

  private isInternalChannel(channel: BookingChannel): boolean {
    return channel === BookingChannel.MANUAL;
  }

  private initialStatus(
    isCustomTime: boolean,
    endAt: Date,
    isBookingConfirmationRequired: boolean,
  ): BookingStatus {
    if (isCustomTime) {
      return endAt.getTime() <= Date.now()
        ? BookingStatus.COMPLETED
        : BookingStatus.CONFIRMED;
    }
    return isBookingConfirmationRequired
      ? BookingStatus.PENDING
      : BookingStatus.CONFIRMED;
  }

  private assertPublicClientFields(dto: CreateBookingDto): void {
    if (!dto.firstName?.trim() || !dto.phone?.trim()) {
      throw new BadRequestException(
        'Client first name and phone are required for online booking',
      );
    }
  }

  /**
   * The booking's client: none for an anonymous booking, the one picked by clientId on a
   * manual booking (returned as `picked`), or the one found or created by phone.
   */
  private async resolveBookingClient(
    brandId: string,
    channel: BookingChannel,
    dto: CreateBookingDto | ManualCreateBookingDto,
  ): Promise<{ client: ResolvedBookingClient; picked: Client | null }> {
    // createManualBooking has already rejected clientId together with anonymous.
    if (this.isInternalChannel(channel) && 'clientId' in dto && dto.clientId) {
      const picked = await this.clientsService.findForBooking(
        brandId,
        dto.clientId,
      );
      if (!picked)
        throw new AppException(
          ErrorCode.BOOKING_CLIENT_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      return { client: this.bookingClient(picked), picked };
    }
    if (this.isAnonymousManualBooking(channel, dto)) {
      return {
        client: {
          id: null,
          firstName: dto.firstName?.trim() ?? '',
          lastName: dto.lastName?.trim() ?? '',
          phone: dto.phone?.trim() || null,
          email: dto.email ?? null,
          bannedAt: null,
        },
        picked: null,
      };
    }
    const firstName = dto.firstName?.trim();
    const phone = dto.phone?.trim();
    if (!firstName || !phone) {
      throw new BadRequestException('Client first name and phone are required');
    }
    const found = await this.clientsService.resolveForBooking(
      brandId,
      phone,
      firstName,
      dto.lastName?.trim() || '',
      dto.email,
    );
    return { client: this.bookingClient(found), picked: null };
  }

  private bookingClient(client: Client): ResolvedBookingClient {
    return {
      id: client.id,
      firstName: client.firstName,
      lastName: client.lastName,
      phone: client.phone,
      email: client.email,
      bannedAt: client.bannedAt,
    };
  }

  private isAnonymousManualBooking(
    channel: BookingChannel,
    dto: CreateBookingDto | ManualCreateBookingDto,
  ): dto is ManualCreateBookingDto {
    return (
      this.isInternalChannel(channel) &&
      'anonymous' in dto &&
      dto.anonymous === true
    );
  }

  /** Plan section 6.2: a blocked brand keeps its page, but takes no online bookings. */
  private async assertOnlineBookingOpen(locationId: string): Promise<void> {
    const { brandId } =
      await this.locationService.getBookingSettings(locationId);
    if (!(await this.billing.isOnlineBookingOpen(brandId)))
      throw new AppException(
        ErrorCode.ONLINE_BOOKING_UNAVAILABLE,
        HttpStatus.FORBIDDEN,
      );
  }
}
