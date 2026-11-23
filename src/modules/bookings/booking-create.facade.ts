import {
  BadRequestException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { BookingVisibility, Client, Prisma } from '@prisma/client';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { TimeUtils } from '../../shared/time/time.utils.js';
import { ReadConsistency } from '../../shared/cache/enums/read-consistency.enum.js';
import { ErrorCode } from '../../shared/validation/error-codes.enum.js';
import { AuditActorRole } from '../audit/enums/audit-actor-role.enum.js';
import { AuditActor } from '../audit/interfaces/audit-actor.interface.js';
import { BillingFacade } from '../billing/billing.facade.js';
import { ClientsService } from '../clients/services/clients.service.js';
import { LocationService } from '../location/services/location.service.js';
import { StaffBookingEvent } from '../notifications/enums/staff-booking-event.enum.js';
import { BookingPricingRequestDto } from './dto/booking-pricing-request.dto.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';
import { ManualBookingItemDto } from './dto/manual-booking-item.dto.js';
import { ManualBookingProductDto } from './dto/manual-booking-product.dto.js';
import { ManualCreateBookingDto } from './dto/manual-create-booking.dto.js';
import { PublicCreateBookingDto } from './dto/public-create-booking.dto.js';
import { BookingChannel } from './enums/booking-channel.enum.js';
import { BookingStatus } from './enums/booking-status.enum.js';
import { ResolvedBookingChannel } from './interfaces/resolved-booking-channel.interface.js';
import { ClassifiedTraffic } from '../../shared/traffic/interfaces/classified-traffic.interface.js';
import { editTrafficSource } from '../../shared/traffic/rules/traffic-source-edit.rules.js';
import { BookingTraffic } from './interfaces/booking-traffic.interface.js';
import { BookingCreationOutcome } from './interfaces/booking-creation-outcome.interface.js';
import { BookingCreationResult } from './interfaces/booking-creation-result.interface.js';
import { BookingCreationRequest } from './interfaces/booking-creation-request.interface.js';
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
          ...(await this.create(locationId, attribution, traffic, null, dto)),
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
  ): Promise<BookingPricingResult> {
    return this.selection.price(locationId, dto);
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
    const items = await this.scheduling.resolveForBooking({
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
    });
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
        products: this.manualProducts(dto, attribution.channel),
        actor,
        request,
        paymentPlan,
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
