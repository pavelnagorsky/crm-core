import {
  BadRequestException,
  ForbiddenException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { BookingVisibility } from '@prisma/client';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { TimeUtils } from '../../shared/time/time.utils.js';
import { ErrorCode } from '../../shared/validation/error-codes.enum.js';
import { AuditActorRole } from '../audit/enums/audit-actor-role.enum.js';
import { AuditActor } from '../audit/interfaces/audit-actor.interface.js';
import { ClientsService } from '../clients/services/clients.service.js';
import { LocationService } from '../location/services/location.service.js';
import { BookingPricingRequestDto } from './dto/booking-pricing-request.dto.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';
import { ManualBookingItemDto } from './dto/manual-booking-item.dto.js';
import { ManualBookingProductDto } from './dto/manual-booking-product.dto.js';
import { ManualCreateBookingDto } from './dto/manual-create-booking.dto.js';
import { BookingSource } from './enums/booking-source.enum.js';
import { BookingStatus } from './enums/booking-status.enum.js';
import { BookingAttribution } from './interfaces/booking-attribution.interface.js';
import { BookingCreationResult } from './interfaces/booking-creation-result.interface.js';
import { BookingPricingResult } from './interfaces/booking-pricing-result.interface.js';
import { BookingSelectionRequest } from './interfaces/booking-selection-request.interface.js';
import { BookingWithItems } from './interfaces/booking-with-items.interface.js';
import { PublicBookingRequestContext } from './interfaces/public-booking-request-context.interface.js';
import { ResolvedBookingClient } from './interfaces/resolved-booking-client.interface.js';
import { isSelfBookingBlocked } from './rules/client-ban.rules.js';
import { BookingEventsService } from './services/booking-events.service.js';
import { BookingReservationService } from './services/booking-reservation.service.js';
import { BookingSchedulingService } from './services/booking-scheduling.service.js';
import { BookingSelectionService } from './services/booking-selection.service.js';
import { PublicBookingRateLimiter } from './services/public-booking-rate-limiter.js';

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
  ) {}

  async createPublicBooking(
    locationId: string,
    dto: CreateBookingDto,
    attribution: BookingAttribution,
    context: PublicBookingRequestContext = { ip: 'unknown' },
  ): Promise<BookingWithItems> {
    this.assertPublicClientFields(dto);
    this.rateLimiter.assertAllowed(dto.phone, context.ip);
    const { booking, timezone, currency, bundleTitle } = await this.create(
      locationId,
      attribution,
      null,
      dto,
    );
    this.logger.log(
      `booking created (public): id=${booking.id} locationId=${locationId} source=${booking.source} items=${booking.items.length} bundleId=${booking.bundleId ?? '-'} startAt=${booking.startAt.toISOString()}`,
    );
    const actor: AuditActor = {
      name: [booking.clientFirstName, booking.clientLastName]
        .filter((part) => part.trim())
        .join(' '),
      role: AuditActorRole.CLIENT,
    };
    this.events.created(booking, actor, currency, bundleTitle);
    this.events.notifyCreated(booking, timezone);
    return booking;
  }

  async createManualBooking(
    locationId: string,
    dto: ManualCreateBookingDto,
    actor: AuditActor,
    canCreateClient = true,
    canComplete = true,
  ): Promise<BookingWithItems> {
    const source =
      dto.source === BookingSource.WALK_IN
        ? BookingSource.WALK_IN
        : BookingSource.MANUAL;
    const { booking, timezone, currency, bundleTitle } = await this.create(
      locationId,
      {
        source,
        bookingPageId: null,
        bookingWidgetId: null,
      },
      actor,
      dto,
      canCreateClient,
      canComplete,
    );
    this.logger.log(
      `booking created (manual): id=${booking.id} locationId=${locationId} source=${booking.source} items=${booking.items.length} bundleId=${booking.bundleId ?? '-'} actor=${actor.name}`,
    );
    this.events.created(booking, actor, currency, bundleTitle);
    this.events.notifyCreated(booking, timezone);
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
    attribution: BookingAttribution,
    actor: AuditActor | null,
    dto: CreateBookingDto | ManualCreateBookingDto,
    canCreateClient = true,
    canComplete = true,
  ): Promise<BookingCreationResult> {
    const location = await this.locationService.findById(locationId);
    if (!location)
      throw new AppException(
        ErrorCode.BOOKING_BUSINESS_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    if (
      !this.isInternalSource(attribution.source) &&
      location.bookingVisibility === BookingVisibility.PRIVATE
    ) {
      throw new AppException(
        ErrorCode.BOOKING_NOT_AVAILABLE,
        HttpStatus.FORBIDDEN,
      );
    }

    const startAt = TimeUtils.localToUtc(dto.startAt, location.timezone);
    const publicClient = this.isInternalSource(attribution.source)
      ? null
      : await this.resolveBookingClient(
          location.brandId,
          attribution.source,
          dto,
        );
    if (
      publicClient &&
      isSelfBookingBlocked(attribution.source, publicClient.bannedAt)
    )
      throw new AppException(ErrorCode.CLIENT_BANNED, HttpStatus.FORBIDDEN);

    const selection = await this.selection.resolveForBooking(locationId, dto);
    const walkInEndAt = this.walkInEndAt(dto, location.timezone);
    const items = await this.scheduling.resolveForBooking({
      locationId,
      services: selection.services,
      startAt,
      executionMode: selection.executionMode,
      requestedStaffId: dto.staffId,
      timezone: location.timezone,
      manualItems: this.manualItems(dto),
      walkInEndAt,
    });
    const envelopeStart = new Date(
      Math.min(...items.map((item) => item.startAt.getTime())),
    );
    const envelopeEnd = new Date(
      Math.max(...items.map((item) => item.endAt.getTime())),
    );
    const status = this.initialStatus(
      attribution.source,
      envelopeEnd,
      location.isBookingConfirmationRequired,
    );
    if (status === BookingStatus.COMPLETED && !canComplete)
      throw new ForbiddenException(
        'Creating a completed booking is not allowed',
      );
    const client =
      publicClient ??
      (await this.resolveBookingClient(
        location.brandId,
        attribution.source,
        dto,
        canCreateClient,
      ));

    const booking = await this.reservations.reserve({
      locationId,
      timezone: location.timezone,
      client,
      items,
      attribution,
      executionMode: selection.executionMode,
      bundleId: selection.bundleId,
      startAt: envelopeStart,
      endAt: envelopeEnd,
      status,
      notes: dto.notes ?? null,
      internalNotes: this.manualInternalNotes(dto, attribution.source),
      products: this.manualProducts(dto, attribution.source),
      actor,
    });

    return {
      booking,
      timezone: location.timezone,
      currency: location.currency,
      bundleTitle: selection.bundleTitle,
    };
  }

  private manualItems(dto: BookingSelectionRequest): ManualBookingItemDto[] {
    return dto.items ?? [];
  }

  private manualProducts(
    dto: CreateBookingDto | ManualCreateBookingDto,
    source: BookingSource,
  ): ManualBookingProductDto[] {
    if (!this.isInternalSource(source) || !('products' in dto)) return [];
    return dto.products ?? [];
  }

  private manualInternalNotes(
    dto: CreateBookingDto | ManualCreateBookingDto,
    source: BookingSource,
  ): string | null {
    if (!this.isInternalSource(source) || !('internalNotes' in dto))
      return null;
    return dto.internalNotes ?? null;
  }

  private isInternalSource(source: BookingSource): boolean {
    return source === BookingSource.MANUAL || source === BookingSource.WALK_IN;
  }

  private walkInEndAt(
    dto: CreateBookingDto | ManualCreateBookingDto,
    timezone: string,
  ): Date | null {
    if (
      !('source' in dto) ||
      dto.source !== BookingSource.WALK_IN ||
      !dto.endAt
    )
      return null;
    return TimeUtils.localToUtc(dto.endAt, timezone);
  }

  private initialStatus(
    source: BookingSource,
    endAt: Date,
    isBookingConfirmationRequired: boolean,
  ): BookingStatus {
    if (source === BookingSource.WALK_IN) {
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

  private async resolveBookingClient(
    brandId: string,
    source: BookingSource,
    dto: CreateBookingDto | ManualCreateBookingDto,
    canCreateClient = true,
  ): Promise<ResolvedBookingClient> {
    if (this.isAnonymousManualBooking(source, dto)) {
      return {
        id: null,
        firstName: dto.firstName?.trim() ?? '',
        lastName: dto.lastName?.trim() ?? '',
        phone: dto.phone?.trim() || null,
        email: dto.email ?? null,
        bannedAt: null,
      };
    }

    const firstName = dto.firstName?.trim();
    const phone = dto.phone?.trim();
    if (!firstName || !phone) {
      throw new BadRequestException('Client first name and phone are required');
    }
    const client = await this.clientsService.resolveForBooking(
      brandId,
      phone,
      firstName,
      dto.lastName?.trim() || '',
      dto.email,
      canCreateClient,
    );
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
    source: BookingSource,
    dto: CreateBookingDto | ManualCreateBookingDto,
  ): dto is ManualCreateBookingDto {
    return (
      this.isInternalSource(source) &&
      'anonymous' in dto &&
      dto.anonymous === true
    );
  }
}
