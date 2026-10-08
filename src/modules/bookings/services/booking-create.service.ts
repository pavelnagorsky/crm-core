import { createHash } from 'crypto';
import {
  BadRequestException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  BookingExecutionMode as PrismaBookingExecutionMode,
  BookingVisibility,
  OrderItemType,
  Prisma,
  ServiceStatus,
} from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../../../database/database.service.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { MoneyService } from '../../../shared/money/money.service.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { CalendarService } from '../../calendar/calendar.service.js';
import { ClientsService } from '../../clients/clients.service.js';
import { StaffService } from '../../staff/staff.service.js';
import { TimeService } from '../../../shared/time/time.service.js';
import { CreateBookingDto } from '../dto/create-booking.dto.js';
import { ManualCreateBookingDto } from '../dto/manual-create-booking.dto.js';
import { BookingSource } from '../enums/booking-source.enum.js';
import { BookingStatus } from '../enums/booking-status.enum.js';
import { isSelfBookingBlocked } from '../rules/client-ban.rules.js';
import { BookingAttribution } from '../interfaces/booking-attribution.interface.js';
import { PublicBookingRequestContext } from '../interfaces/public-booking-request-context.interface.js';
import { PublicBookingRateLimiter } from './public-booking-rate-limiter.js';
import { AUDIT_EVENT } from '../../audit/constants/audit.constants.js';
import { AuditEntity } from '../../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../../audit/enums/audit-event.enum.js';
import { AuditActionType } from '../../audit/enums/audit-action-type.enum.js';
import { AuditActorRole } from '../../audit/enums/audit-actor-role.enum.js';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../../audit/interfaces/audit-log-event.interface.js';
import { NOTIFICATION_EVENT } from '../../notifications/notifications.service.js';
import { BookingConfirmedNotification } from '../../notifications/notifications/booking-confirmed.notification.js';
import { BookingClientService } from './booking-client.service.js';
import { BookingWithItems } from '../interfaces/booking-with-items.interface.js';
import { BookingServiceSnapshot } from '../interfaces/booking-service-snapshot.interface.js';
import { ResolvedBookingItem } from '../interfaces/resolved-booking-item.interface.js';
import { ManualBookingItemDto } from '../dto/manual-booking-item.dto.js';
import { ManualBookingProductDto } from '../dto/manual-booking-product.dto.js';
import { BookingPricingRequestDto } from '../dto/booking-pricing-request.dto.js';
import { OrdersService } from '../../orders/orders.service.js';
import { OrderComputeService } from '../../orders/services/order-compute.service.js';
import { StaffEarningsService } from '../../payroll/earnings/staff-earnings.service.js';
import { ResolvedBookingClient } from '../interfaces/resolved-booking-client.interface.js';
import { BookingPricingResult } from '../interfaces/booking-pricing-result.interface.js';
import { OrderPricingLine } from '../../orders/interfaces/order-pricing-line.interface.js';
import { BookingSelectionRequest } from '../interfaces/booking-selection-request.interface.js';

@Injectable()
export class BookingCreateService {
  private readonly logger = new Logger(BookingCreateService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly calendarService: CalendarService,
    private readonly clientsService: ClientsService,
    private readonly staffService: StaffService,
    private readonly eventEmitter: EventEmitter2,
    private readonly bookingClientService: BookingClientService,
    private readonly rateLimiter: PublicBookingRateLimiter,
    private readonly orders: OrdersService,
    private readonly compute: OrderComputeService,
    private readonly staffEarnings: StaffEarningsService,
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
    this.emitBookingCreated(booking, actor, currency, bundleTitle);
    this.emitBookingNotification(booking, timezone);
    return booking;
  }

  async createManualBooking(
    locationId: string,
    dto: ManualCreateBookingDto,
    actor: AuditActor,
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
    );
    this.logger.log(
      `booking created (manual): id=${booking.id} locationId=${locationId} source=${booking.source} items=${booking.items.length} bundleId=${booking.bundleId ?? '-'} actor=${actor.name}`,
    );
    this.emitBookingCreated(booking, actor, currency, bundleTitle);
    this.emitBookingNotification(booking, timezone);
    return booking;
  }

  async price(
    locationId: string,
    dto: BookingPricingRequestDto,
  ): Promise<BookingPricingResult> {
    const location = await this.db.location.findUnique({
      where: { id: locationId },
      select: { currency: true },
    });
    if (!location) {
      throw new AppException(
        ErrorCode.BOOKING_BUSINESS_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }

    const selection = this.hasServiceSelection(dto)
      ? await this.loadSelection(locationId, dto)
      : null;
    const serviceLines = selection
      ? this.priceServiceLines(selection.services, this.manualItems(dto))
      : [];
    const productLines = await this.orders.priceProductItems(
      locationId,
      dto.products ?? [],
    );
    const serviceTotals = this.compute.totals(serviceLines);
    const productTotals = this.compute.totals(productLines);
    const totals = this.compute.totals([...serviceLines, ...productLines]);

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

  private async create(
    locationId: string,
    attribution: BookingAttribution,
    actor: AuditActor | null,
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
      !this.isInternalSource(attribution.source) &&
      business.bookingVisibility === BookingVisibility.PRIVATE
    ) {
      throw new AppException(
        ErrorCode.BOOKING_NOT_AVAILABLE,
        HttpStatus.FORBIDDEN,
      );
    }

    const startAt = TimeService.localToUtc(dto.startAt, business.timezone);
    const client = await this.resolveBookingClient(
      locationId,
      attribution.source,
      dto,
    );
    if (isSelfBookingBlocked(attribution.source, client.bannedAt)) {
      throw new AppException(ErrorCode.CLIENT_BANNED, HttpStatus.FORBIDDEN);
    }

    const selection = await this.loadSelection(locationId, dto);
    const walkInEndAt = this.walkInEndAt(dto, business.timezone);
    const items = await this.resolveItems(
      locationId,
      selection.services,
      startAt,
      selection.executionMode,
      dto.staffId,
      business.timezone,
      this.manualItems(dto),
      walkInEndAt,
    );
    const envelopeStart = new Date(
      Math.min(...items.map((item) => item.startAt.getTime())),
    );
    const envelopeEnd = new Date(
      Math.max(...items.map((item) => item.endAt.getTime())),
    );
    const status = this.initialStatus(
      attribution.source,
      envelopeEnd,
      business.isBookingConfirmationRequired,
    );
    const lockKeys = this.lockKeysForItems(items, business.timezone);
    const manualProducts = this.manualProducts(dto, attribution.source);
    const internalNotes = this.manualInternalNotes(dto, attribution.source);

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
          this.staffService.findShiftForDate(
            item.staffId,
            new Date(dateStr),
            tx,
          ),
          this.calendarService.listBlockingEvents(
            locationId,
            [item.staffId],
            item.startAt,
            item.endAt,
            [],
            tx,
          ),
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
        const calendarEvent = await this.calendarService.createBookingEvent(
          {
            locationId,
            staffId: item.staffId,
            startAt: item.startAt,
            endAt: item.endAt,
          },
          tx,
        );
        createdItems.push({ ...item, calendarEventId: calendarEvent.id });
      }

      const booking = await tx.booking.create({
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
          clientEmail: client.email,
          notes: dto.notes ?? null,
          internalNotes,
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
      if (status === BookingStatus.COMPLETED) {
        const completedActor = actor ?? {
          name: 'System',
          role: AuditActorRole.SYSTEM,
        };
        const order = await this.orders.syncCompletedBooking(
          booking,
          completedActor,
          tx,
        );
        await this.staffEarnings.recordForCompletedBooking(booking, tx, order);
        await this.staffEarnings.syncForCompletedBooking(
          booking,
          completedActor,
          tx,
          order,
        );
      }
      if (manualProducts.length > 0) {
        const productActor = actor ?? {
          name: 'System',
          role: AuditActorRole.SYSTEM,
        };
        await this.orders.addDraftProductsToBookingOrder(
          booking,
          manualProducts,
          productActor,
          tx,
        );
      }
      return booking;
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
    dto: BookingSelectionRequest,
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
    const executionMode = dto.executionMode
      ? (dto.executionMode as PrismaBookingExecutionMode)
      : PrismaBookingExecutionMode.SEQUENTIAL;
    return {
      bundleId: null,
      bundleTitle: null,
      executionMode,
      services: serviceIds.map((serviceId) => byId.get(serviceId)!),
    };
  }

  private priceServiceLines(
    services: BookingServiceSnapshot[],
    manualItems: ManualBookingItemDto[],
  ): OrderPricingLine[] {
    return services.map((service, index) => {
      const quantity = new Prisma.Decimal(1);
      const price = this.compute.priceLine(
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

  private async resolveItems(
    locationId: string,
    services: BookingServiceSnapshot[],
    startAt: Date,
    executionMode: PrismaBookingExecutionMode,
    requestedStaffId: string | undefined,
    timezone: string,
    manualItems: ManualBookingItemDto[],
    walkInEndAt: Date | null,
  ): Promise<ResolvedBookingItem[]> {
    const staffNames = new Map<string, string>();
    const result: ResolvedBookingItem[] = [];
    const cursor = new Date(startAt);
    const usedParallelStaff = new Set<string>();

    for (let index = 0; index < services.length; index += 1) {
      const service = services[index];
      const manual = manualItems[index];
      const interval = this.itemInterval(
        services,
        index,
        startAt,
        cursor,
        executionMode,
        walkInEndAt,
      );
      const staffId = await this.resolveItemStaff(
        locationId,
        service.id,
        manual?.staffId ?? requestedStaffId,
        interval.startAt,
        interval.endAt,
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
        startAt: interval.startAt,
        endAt: interval.endAt,
        serviceTitle: service.title,
        serviceDuration: service.durationMinutes,
        listPrice: service.price,
        chargedPrice: service.price,
        customPrice: manual?.customPrice ?? null,
        staffName: staffNames.get(staffId)!,
      });
      if (executionMode === PrismaBookingExecutionMode.SEQUENTIAL)
        cursor.setTime(interval.endAt.getTime());
    }

    return result;
  }

  private itemInterval(
    services: BookingServiceSnapshot[],
    index: number,
    startAt: Date,
    cursor: Date,
    executionMode: PrismaBookingExecutionMode,
    walkInEndAt: Date | null,
  ): { startAt: Date; endAt: Date } {
    const defaultMs =
      (services[index].durationMinutes + services[index].bufferMinutes) *
      60_000;
    if (!walkInEndAt) {
      const itemStart =
        executionMode === PrismaBookingExecutionMode.PARALLEL
          ? startAt
          : new Date(cursor);
      return {
        startAt: itemStart,
        endAt: new Date(itemStart.getTime() + defaultMs),
      };
    }

    if (walkInEndAt.getTime() <= startAt.getTime()) {
      throw new AppException(
        ErrorCode.BOOKING_TIME_INVALID,
        HttpStatus.BAD_REQUEST,
      );
    }

    if (executionMode === PrismaBookingExecutionMode.PARALLEL) {
      return { startAt, endAt: walkInEndAt };
    }

    const totalDefaultMs = services.reduce(
      (sum, service) =>
        sum + (service.durationMinutes + service.bufferMinutes) * 60_000,
      0,
    );
    const totalActualMs = walkInEndAt.getTime() - startAt.getTime();
    const itemStart = new Date(cursor);
    const itemEnd =
      index === services.length - 1
        ? walkInEndAt
        : new Date(
            itemStart.getTime() +
              Math.round((totalActualMs * defaultMs) / totalDefaultMs),
          );
    if (itemEnd.getTime() <= itemStart.getTime()) {
      throw new AppException(
        ErrorCode.BOOKING_TIME_INVALID,
        HttpStatus.BAD_REQUEST,
      );
    }
    return { startAt: itemStart, endAt: itemEnd };
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

  private isManualDto(
    dto: CreateBookingDto | ManualCreateBookingDto,
  ): dto is ManualCreateBookingDto {
    return (
      'items' in dto ||
      'executionMode' in dto ||
      'anonymous' in dto ||
      'source' in dto ||
      'internalNotes' in dto ||
      'products' in dto ||
      'endAt' in dto
    );
  }

  private isInternalSource(source: BookingSource): boolean {
    return source === BookingSource.MANUAL || source === BookingSource.WALK_IN;
  }

  private isWalkInDto(
    dto: CreateBookingDto | ManualCreateBookingDto,
  ): dto is ManualCreateBookingDto {
    return this.isManualDto(dto) && dto.source === BookingSource.WALK_IN;
  }

  private walkInEndAt(
    dto: CreateBookingDto | ManualCreateBookingDto,
    timezone: string,
  ): Date | null {
    if (!this.isWalkInDto(dto) || !dto.endAt) return null;
    return TimeService.localToUtc(dto.endAt, timezone);
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
    locationId: string,
    source: BookingSource,
    dto: CreateBookingDto | ManualCreateBookingDto,
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
      locationId,
      phone,
      firstName,
      dto.lastName?.trim() || '',
      dto.email,
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
      this.isManualDto(dto) &&
      dto.anonymous === true
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
    if (booking.status === BookingStatus.COMPLETED) return;
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
