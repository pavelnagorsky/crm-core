import { createHash } from 'crypto';
import {
  forwardRef,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  BookingExecutionMode as PrismaBookingExecutionMode,
  CalendarEventRepeatType,
  CalendarEventType,
  Prisma,
  ServiceStatus,
} from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BookingVisibility } from '../business/enums/booking-visibility.enum.js';
import { DatabaseService } from '../../database/database.service.js';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { MoneyService } from '../../shared/money/money.service.js';
import { ErrorCode } from '../../shared/validation/error-codes.enum.js';
import { CalendarService } from '../calendar/calendar.service.js';
import { ClientsService } from '../clients/clients.service.js';
import { StaffService } from '../staff/staff.service.js';
import { TimeService } from '../time/time.service.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';
import { ManualCreateBookingDto } from './dto/manual-create-booking.dto.js';
import { BookingSource } from './enums/booking-source.enum.js';
import { BookingStatus } from './enums/booking-status.enum.js';
import { isSelfBookingBlocked } from './client-ban.rules.js';
import { BookingChannelAttributionService } from '../booking-channels/booking-channel-attribution.service.js';
import { BookingAttribution } from './interfaces/booking-attribution.interface.js';
import { PublicBookingRequestContext } from './interfaces/public-booking-request-context.interface.js';
import { PublicBookingRateLimiter } from './public-booking-rate-limiter.js';
import { AUDIT_EVENT } from '../audit/audit.constants.js';
import { AuditEntity } from '../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../audit/enums/audit-event.enum.js';
import { AuditActionType } from '../audit/enums/audit-action-type.enum.js';
import { AuditActorRole } from '../audit/enums/audit-actor-role.enum.js';
import { AuditActor } from '../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../audit/interfaces/audit-log-event.interface.js';
import { NOTIFICATION_EVENT } from '../notifications/notifications.service.js';
import { BookingConfirmedNotification } from '../notifications/notifications/booking-confirmed.notification.js';
import { BookingClientService } from './booking-client.service.js';
import { BookingWithItems } from './interfaces/booking-with-items.interface.js';
import { BookingServiceSnapshot } from './interfaces/booking-service-snapshot.interface.js';
import { ResolvedBookingItem } from './interfaces/resolved-booking-item.interface.js';
import { ManualBookingItemDto } from './dto/manual-booking-item.dto.js';

@Injectable()
export class BookingCreateService {
  private readonly logger = new Logger(BookingCreateService.name);

  constructor(
    private readonly db: DatabaseService,
    @Inject(forwardRef(() => CalendarService))
    private readonly calendarService: CalendarService,
    private readonly clientsService: ClientsService,
    private readonly staffService: StaffService,
    private readonly eventEmitter: EventEmitter2,
    private readonly bookingClientService: BookingClientService,
    @Inject(forwardRef(() => BookingChannelAttributionService))
    private readonly attribution: BookingChannelAttributionService,
    private readonly rateLimiter: PublicBookingRateLimiter,
  ) {}

  async createPublicBooking(
    locationId: string,
    dto: CreateBookingDto,
    context: PublicBookingRequestContext = { ip: 'unknown' },
  ): Promise<BookingWithItems> {
    this.rateLimiter.assertAllowed(dto.phone, context.ip);
    const attribution = await this.attribution.resolve(
      locationId,
      dto.bookingPageId,
      dto.bookingWidgetId,
      context.origin,
    );
    const { booking, timezone, currency, bundleTitle } = await this.create(
      locationId,
      attribution,
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
    this.emitBookingCreated(booking, actor, currency, bundleTitle);
    this.emitBookingNotification(booking, timezone);
    return booking;
  }

  async createManualBooking(
    locationId: string,
    dto: ManualCreateBookingDto,
    actor: AuditActor,
  ): Promise<BookingWithItems> {
    const { booking, timezone, currency, bundleTitle } = await this.create(
      locationId,
      {
        source: BookingSource.MANUAL,
        bookingPageId: null,
        bookingWidgetId: null,
      },
      dto,
    );
    this.logger.log(
      `booking created (manual): id=${booking.id} locationId=${locationId} source=${booking.source} items=${booking.items.length} bundleId=${booking.bundleId ?? '-'} actor=${actor.name}`,
    );
    this.emitBookingCreated(booking, actor, currency, bundleTitle);
    this.emitBookingNotification(booking, timezone);
    return booking;
  }

  private async create(
    locationId: string,
    attribution: BookingAttribution,
    dto: CreateBookingDto | ManualCreateBookingDto,
  ): Promise<{
    booking: BookingWithItems;
    timezone: string;
    currency: string;
    bundleTitle: string | null;
  }> {
    const business = await this.db.location.findUnique({
      where: { id: locationId },
      select: {
        isBookingConfirmationRequired: true,
        timezone: true,
        bookingVisibility: true,
        currency: true,
      },
    });
    if (!business)
      throw new AppException(
        ErrorCode.BOOKING_BUSINESS_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    if (
      attribution.source !== BookingSource.MANUAL &&
      business.bookingVisibility === BookingVisibility.PRIVATE
    ) {
      throw new AppException(
        ErrorCode.BOOKING_NOT_AVAILABLE,
        HttpStatus.FORBIDDEN,
      );
    }

    const startAt = TimeService.localToUtc(dto.startAt, business.timezone);
    const lastName = dto.lastName?.trim() || '';
    const client = await this.clientsService.resolveForBooking(
      locationId,
      dto.phone,
      dto.firstName,
      lastName,
      dto.email,
    );
    if (isSelfBookingBlocked(attribution.source, client.bannedAt)) {
      throw new AppException(ErrorCode.CLIENT_BANNED, HttpStatus.FORBIDDEN);
    }

    const selection = await this.loadSelection(locationId, dto);
    const items = await this.resolveItems(
      locationId,
      selection.services,
      startAt,
      selection.executionMode,
      dto.staffId,
      business.timezone,
      this.manualItems(dto),
    );
    const status = business.isBookingConfirmationRequired
      ? BookingStatus.PENDING
      : BookingStatus.CONFIRMED;

    const envelopeStart = new Date(
      Math.min(...items.map((item) => item.startAt.getTime())),
    );
    const envelopeEnd = new Date(
      Math.max(...items.map((item) => item.endAt.getTime())),
    );
    const lockKeys = this.lockKeysForItems(items, business.timezone);

    const booking = await this.db.$transaction(async (tx) => {
      for (const lockKey of lockKeys) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;
      }

      for (const item of items) {
        const dateStr = TimeService.zonedDateStr(
          item.startAt,
          business.timezone,
        );
        const [shift, blockEvents] = await Promise.all([
          tx.staffShift.findFirst({
            where: { staffId: item.staffId, date: new Date(dateStr) },
          }),
          tx.calendarEvent.findMany({
            where: {
              locationId,
              OR: [{ staffId: null }, { staffId: item.staffId }],
              repeatType: CalendarEventRepeatType.NONE,
              startDateTime: { lte: item.endAt },
              endDateTime: { gte: item.startAt },
            },
            include: {
              cancelledOccurrences: { select: { occurrenceDate: true } },
            },
          }),
        ]);

        // Re-check inside the transaction using tx-fetched data; this must run under the
        // multi-staff advisory locks acquired above so parallel bookings cannot race.
        if (
          !this.calendarService.isSlotFree(
            item.staffId,
            dateStr,
            item.startAt,
            item.endAt,
            shift,
            blockEvents,
            business.timezone,
          )
        ) {
          this.logger.warn(
            `slot unavailable on create: locationId=${locationId} staffId=${item.staffId} startAt=${item.startAt.toISOString()}`,
          );
          throw new AppException(
            ErrorCode.BOOKING_SLOT_UNAVAILABLE,
            HttpStatus.CONFLICT,
          );
        }
      }

      const createdItems = [];
      for (const item of items) {
        const calendarEvent = await tx.calendarEvent.create({
          data: {
            locationId,
            staffId: item.staffId,
            type: CalendarEventType.BOOKING,
            repeatType: CalendarEventRepeatType.NONE,
            startDateTime: item.startAt,
            endDateTime: item.endAt,
          },
        });
        createdItems.push({ ...item, calendarEventId: calendarEvent.id });
      }

      return tx.booking.create({
        data: {
          locationId,
          clientId: client.id,
          startAt: envelopeStart,
          endAt: envelopeEnd,
          executionMode: selection.executionMode,
          bundleId: selection.bundleId,
          status,
          source: attribution.source,
          bookingPageId: attribution.bookingPageId,
          bookingWidgetId: attribution.bookingWidgetId,
          clientFirstName: client.firstName,
          clientLastName: client.lastName,
          clientPhone: client.phone,
          clientEmail: client.email ?? null,
          notes: dto.notes ?? null,
          items: {
            create: createdItems.map((item) => ({
              locationId,
              serviceId: item.serviceId,
              staffId: item.staffId,
              sortOrder: item.sortOrder,
              startAt: item.startAt,
              endAt: item.endAt,
              serviceTitle: item.serviceTitle,
              serviceDuration: item.serviceDuration,
              listPrice: item.listPrice,
              chargedPrice: item.chargedPrice,
              customPrice: item.customPrice,
              staffName: item.staffName,
              calendarEventId: item.calendarEventId,
            })),
          },
        },
        include: { items: { orderBy: { sortOrder: 'asc' } } },
      });
    });

    return {
      booking,
      timezone: business.timezone,
      currency: business.currency,
      bundleTitle: selection.bundleTitle,
    };
  }

  private async loadSelection(
    locationId: string,
    dto: CreateBookingDto | ManualCreateBookingDto,
  ): Promise<{
    services: BookingServiceSnapshot[];
    executionMode: PrismaBookingExecutionMode;
    bundleId: string | null;
    bundleTitle: string | null;
  }> {
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
      const bundle = await this.db.serviceBundle.findFirst({
        where: { id: dto.bundleId, locationId, status: ServiceStatus.ACTIVE },
        include: {
          items: { orderBy: { sortOrder: 'asc' }, include: { service: true } },
        },
      });
      if (!bundle)
        throw new AppException(
          ErrorCode.BOOKING_BUNDLE_NOT_FOUND,
          HttpStatus.NOT_FOUND,
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

    const uniqueServiceIds = [...new Set(serviceIds)];
    const services = await this.db.service.findMany({
      where: {
        id: { in: uniqueServiceIds },
        locationId,
        status: ServiceStatus.ACTIVE,
      },
      select: {
        id: true,
        title: true,
        durationMinutes: true,
        bufferMinutes: true,
        price: true,
      },
    });
    if (services.length !== uniqueServiceIds.length) {
      throw new AppException(
        ErrorCode.BOOKING_SERVICE_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }
    const byId = new Map(services.map((service) => [service.id, service]));
    const executionMode =
      this.isManualDto(dto) && dto.executionMode
        ? (dto.executionMode as PrismaBookingExecutionMode)
        : PrismaBookingExecutionMode.SEQUENTIAL;
    return {
      bundleId: null,
      bundleTitle: null,
      executionMode,
      services: serviceIds.map((serviceId) => byId.get(serviceId)!),
    };
  }

  private async resolveItems(
    locationId: string,
    services: BookingServiceSnapshot[],
    startAt: Date,
    executionMode: PrismaBookingExecutionMode,
    requestedStaffId: string | undefined,
    timezone: string,
    manualItems: ManualBookingItemDto[],
  ): Promise<ResolvedBookingItem[]> {
    const staffNames = new Map<string, string>();
    const result: ResolvedBookingItem[] = [];
    const cursor = new Date(startAt);
    const usedParallelStaff = new Set<string>();

    for (let index = 0; index < services.length; index += 1) {
      const service = services[index];
      const manual = manualItems[index];
      const itemStart =
        executionMode === PrismaBookingExecutionMode.PARALLEL
          ? startAt
          : new Date(cursor);
      const itemEnd = new Date(
        itemStart.getTime() +
          (service.durationMinutes + service.bufferMinutes) * 60_000,
      );
      const staffId = await this.resolveItemStaff(
        locationId,
        service.id,
        manual?.staffId ?? requestedStaffId,
        itemStart,
        itemEnd,
        timezone,
        executionMode === PrismaBookingExecutionMode.PARALLEL
          ? usedParallelStaff
          : new Set<string>(),
      );
      usedParallelStaff.add(staffId);
      if (!staffNames.has(staffId)) {
        const staff = await this.staffService.findById(staffId);
        staffNames.set(staffId, staff.name);
      }
      result.push({
        serviceId: service.id,
        staffId,
        sortOrder: index,
        startAt: itemStart,
        endAt: itemEnd,
        serviceTitle: service.title,
        serviceDuration: service.durationMinutes,
        listPrice: service.price,
        chargedPrice: service.price,
        customPrice: manual?.customPrice ?? null,
        staffName: staffNames.get(staffId)!,
      });
      if (executionMode === PrismaBookingExecutionMode.SEQUENTIAL)
        cursor.setTime(itemEnd.getTime());
    }

    return result;
  }

  private async resolveItemStaff(
    locationId: string,
    serviceId: string,
    requestedStaffId: string | undefined,
    startAt: Date,
    endAt: Date,
    timezone: string,
    excludedStaffIds: Set<string>,
  ): Promise<string> {
    const candidates = await this.staffService.resolveStaffForService(
      locationId,
      serviceId,
      requestedStaffId,
    );
    if (requestedStaffId && candidates.length === 0) {
      throw new AppException(
        ErrorCode.BOOKING_STAFF_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }
    const filteredCandidates = candidates.filter(
      (candidate) => !excludedStaffIds.has(candidate.id),
    );
    const available = await this.calendarService.filterAvailableStaff(
      locationId,
      filteredCandidates,
      TimeService.zonedDateStr(startAt, timezone),
      startAt,
      endAt,
      timezone,
    );
    if (available.length === 0)
      throw new AppException(
        ErrorCode.BOOKING_NO_STAFF_AVAILABLE,
        HttpStatus.CONFLICT,
      );
    if (requestedStaffId) return available[0].id;

    const dayStart = TimeService.localToUtc(
      `${TimeService.zonedDateStr(startAt, timezone)}T00:00:00`,
      timezone,
    );
    const dayEnd = TimeService.addDaysInTz(dayStart, 1, timezone);
    const counts = await this.db.bookingItem.groupBy({
      by: ['staffId'],
      where: {
        staffId: { in: available.map((staff) => staff.id) },
        startAt: { gte: dayStart, lt: dayEnd },
      },
      _count: { id: true },
    });
    const countByStaff = new Map(
      counts.map((row) => [row.staffId, row._count.id]),
    );
    return [...available].sort(
      (a, b) => (countByStaff.get(a.id) ?? 0) - (countByStaff.get(b.id) ?? 0),
    )[0].id;
  }

  private manualItems(
    dto: CreateBookingDto | ManualCreateBookingDto,
  ): ManualBookingItemDto[] {
    return this.isManualDto(dto) ? (dto.items ?? []) : [];
  }

  private isManualDto(
    dto: CreateBookingDto | ManualCreateBookingDto,
  ): dto is ManualCreateBookingDto {
    return 'items' in dto || 'executionMode' in dto;
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
      const share = MoneyService.quantize(fixedPrice.div(servicePrices.length));
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
      const share = MoneyService.quantize(fixedPrice.mul(price).div(total));
      allocated = allocated.plus(share);
      return share;
    });
  }

  private lockKeysForItems(
    items: ResolvedBookingItem[],
    timezone: string,
  ): bigint[] {
    return [
      ...new Set(
        items.map(
          (item) =>
            `${item.staffId}:${TimeService.zonedDateStr(item.startAt, timezone)}`,
        ),
      ),
    ]
      .map((key) => {
        const [staffId, dateStr] = key.split(':');
        return this.buildLockKey(staffId, dateStr);
      })
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }

  private emitBookingCreated(
    booking: BookingWithItems,
    actor: AuditActor,
    currency: string,
    bundleTitle: string | null,
  ): void {
    const event: AuditLogEvent = {
      locationId: booking.locationId,
      entityType: AuditEntity.BOOKING,
      entityId: booking.id,
      eventType: AuditEvent.BOOKING_CREATED,
      actionType: AuditActionType.CREATE,
      occurredAt: new Date(),
      actor,
      payload: {
        items: booking.items.map((item) => ({
          serviceName: item.serviceTitle,
          staffName: item.staffName,
          price: MoneyService.format(item.customPrice ?? item.chargedPrice),
        })),
        startTime: booking.startAt.toISOString(),
        endTime: booking.endAt.toISOString(),
        totalPrice: MoneyService.format(
          booking.items.reduce(
            (sum, item) => sum.plus(item.customPrice ?? item.chargedPrice),
            new Prisma.Decimal(0),
          ),
        ),
        currency,
        source: booking.source,
        executionMode: booking.executionMode,
        ...(bundleTitle ? { bundleTitle } : {}),
      },
    };
    this.eventEmitter.emit(AUDIT_EVENT, event);
  }

  private emitBookingNotification(
    booking: BookingWithItems,
    timezone: string,
  ): void {
    if (!booking.clientEmail) return;
    const clientToken = this.bookingClientService.generateClientToken(
      booking.id,
    );
    this.eventEmitter.emit(
      NOTIFICATION_EVENT,
      new BookingConfirmedNotification(
        {
          id: booking.id,
          clientEmail: booking.clientEmail,
          clientFirstName: booking.clientFirstName,
          clientLastName: booking.clientLastName,
          serviceTitle: booking.items
            .map((item) => item.serviceTitle)
            .join(', '),
          staffName: [
            ...new Set(booking.items.map((item) => item.staffName)),
          ].join(', '),
          startAt: booking.startAt,
          endAt: booking.endAt,
          timezone,
        },
        clientToken,
      ),
    );
  }

  private buildLockKey(staffId: string, dateStr: string): bigint {
    const hash = createHash('sha256').update(`${staffId}:${dateStr}`).digest();
    return hash.readBigInt64BE(0);
  }
}
