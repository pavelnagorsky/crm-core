import { HttpStatus } from '@nestjs/common';
import {
  BookingVisibility,
  CalendarEventRepeatType,
  CalendarEventType,
  ClientNoticeType,
  OrderItemType,
  Prisma,
} from '@prisma/client';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { AUDIT_EVENT } from '../audit/constants/audit.constants.js';
import { AuditActorRole } from '../audit/enums/audit-actor-role.enum.js';
import { NOTIFICATION_EVENT } from '../notifications/services/notifications.service.js';
import { OrderPricingCalculator } from '../orders/calculators/order-pricing.calculator.js';
import { BookingCreateFacade } from './booking-create.facade.js';
import { CLIENT_NOTICE_DELAY_MS } from './rules/booking-client-notice.rules.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';
import { ManualCreateBookingDto } from './dto/manual-create-booking.dto.js';
import { BookingChannel } from './enums/booking-channel.enum.js';
import { BookingStatus } from './enums/booking-status.enum.js';
import { TrafficSource } from '../../shared/traffic/enums/traffic-source.enum.js';
import { BookingEventsService } from './services/booking-events.service.js';
import { BookingReservationService } from './services/booking-reservation.service.js';
import { BookingSchedulingService } from './services/booking-scheduling.service.js';
import { BookingSelectionService } from './services/booking-selection.service.js';
import { BookingSlotLockService } from './services/booking-slot-lock.service.js';

const dto: CreateBookingDto = {
  serviceId: 'service-1',
  staffId: 'staff-1',
  startAt: '2026-09-20T10:00:00',
  firstName: 'Анна',
  lastName: 'Иванова',
  phone: '+375291112233',
};

const publicAttribution = {
  channel: BookingChannel.PUBLIC_PAGE,
  bookingPageId: null,
  bookingWidgetId: null,
};

const directTraffic = {
  source: TrafficSource.DIRECT,
  detail: null,
  touch: null,
};

function channelDeps(): [never] {
  return [{ assertAllowed: vi.fn() } as never];
}

function commercialDeps(): [never, OrderPricingCalculator, never] {
  return [
    { syncCompletedBooking: vi.fn(), priceProductItems: vi.fn() } as never,
    new OrderPricingCalculator(),
    {
      recordForCompletedBooking: vi.fn(),
      syncForCompletedBooking: vi.fn(),
    } as never,
  ];
}

type CatalogServiceRow = {
  id: string;
  title: string;
  durationMinutes: number;
  bufferMinutes: number;
  price: Prisma.Decimal | number;
};

function catalogDeps(db: {
  service: { findMany: () => Promise<CatalogServiceRow[]> };
  location: { findUnique: () => Promise<unknown> };
}): [never, never] {
  return [
    {
      resolveServicesForBooking: vi.fn(
        async (_locationId: string, serviceIds: string[]) => {
          const rows = await db.service.findMany();
          const byId = new Map(rows.map((row) => [row.id, row]));
          return serviceIds.map((serviceId) => byId.get(serviceId)!);
        },
      ),
    } as never,
    {
      findById: vi.fn(() => db.location.findUnique()),
      acquireActiveOperationLock: vi.fn().mockResolvedValue(true),
    } as never,
  ];
}

function setup(billing?: { isOnlineBookingOpen: ReturnType<typeof vi.fn> }) {
  const clients = { resolveForBooking: vi.fn() };
  const staff = {
    resolveStaffForService: vi.fn().mockResolvedValue([]),
    findById: vi.fn(),
  };
  const calendar = { filterAvailableStaff: vi.fn().mockResolvedValue([]) };
  const db = {
    location: {
      findUnique: vi.fn().mockResolvedValue({
        brandId: 'brand-1',
        isBookingConfirmationRequired: false,
        timezone: 'Europe/Minsk',
        bookingVisibility: BookingVisibility.PUBLIC,
        currency: 'BYN',
      }),
    },
    service: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'service-1',
          title: 'Стрижка',
          durationMinutes: 60,
          bufferMinutes: 0,
          price: 50,
        },
      ]),
    },
  };
  const service = createBookingService(
    db as never,
    calendar as never,
    clients as never,
    staff as never,
    { emit: vi.fn() } as never,
    { generateClientToken: vi.fn(), managementUrl: vi.fn() } as never,
    ...channelDeps(),
    ...commercialDeps(),
    ...catalogDeps(db),
    billing,
  );
  return { service, clients, staff, db };
}

function pricingSetup() {
  const db = {
    location: {
      findUnique: vi.fn().mockResolvedValue({ currency: 'BYN' }),
    },
    service: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'service-1',
          title: 'Haircut',
          durationMinutes: 60,
          bufferMinutes: 0,
          price: new Prisma.Decimal(50),
        },
      ]),
    },
    $transaction: vi.fn(),
  };
  const orders = {
    syncCompletedBooking: vi.fn(),
    priceProductItems: vi.fn().mockResolvedValue([
      {
        type: OrderItemType.PRODUCT,
        catalogItemId: 'product-1',
        title: 'Shampoo',
        sku: 'SKU-1',
        unit: null,
        quantity: new Prisma.Decimal(2),
        listUnitPrice: new Prisma.Decimal(20),
        listLineTotal: new Prisma.Decimal(40),
        customUnitPrice: new Prisma.Decimal(15),
        unitPrice: new Prisma.Decimal(15),
        lineSubtotal: new Prisma.Decimal(30),
        discountTotal: new Prisma.Decimal(0),
        lineTotal: new Prisma.Decimal(30),
      },
    ]),
  };
  const service = createBookingService(
    db as never,
    {} as never,
    {} as never,
    {} as never,
    { emit: vi.fn() } as never,
    { generateClientToken: vi.fn(), managementUrl: vi.fn() } as never,
    ...channelDeps(),
    orders as never,
    new OrderPricingCalculator(),
    {
      recordForCompletedBooking: vi.fn(),
      syncForCompletedBooking: vi.fn(),
    } as never,
    ...catalogDeps(db),
  );
  return { service, db, orders };
}

describe('BookingCreateFacade client ban', () => {
  it('rejects public booking for a banned phone before looking up staff', async () => {
    const { service, clients, staff } = setup();
    clients.resolveForBooking.mockResolvedValue({
      bannedAt: new Date('2026-09-01T00:00:00.000Z'),
    });

    const error = await service
      .createPublicBooking('business-1', dto, publicAttribution, directTraffic)
      .then(
        () => null,
        (caught: unknown) => caught,
      );

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).errorCode).toBe('CLIENT_BANNED');
    expect((error as AppException).getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect(staff.resolveStaffForService).not.toHaveBeenCalled();
  });

  it('lets a banned client be booked from the journal', async () => {
    const { service, clients } = setup();
    clients.resolveForBooking.mockResolvedValue({
      bannedAt: new Date('2026-09-01T00:00:00.000Z'),
    });

    const error = await service
      .createManualBooking('business-1', dto, {
        id: 'user-1',
        name: 'Ольга',
        role: AuditActorRole.OWNER,
      })
      .then(
        () => null,
        (caught: unknown) => caught,
      );

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).errorCode).toBe('BOOKING_STAFF_NOT_FOUND');
  });

  it('lets a client who is not banned book online', async () => {
    const { service, clients } = setup();
    clients.resolveForBooking.mockResolvedValue({ bannedAt: null });

    const error = await service
      .createPublicBooking('business-1', dto, publicAttribution, directTraffic)
      .then(
        () => null,
        (caught: unknown) => caught,
      );

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).errorCode).toBe('BOOKING_STAFF_NOT_FOUND');
  });

  it('passes an empty surname when the guest omits it', async () => {
    const { service, clients } = setup();
    clients.resolveForBooking.mockResolvedValue({
      bannedAt: new Date('2026-09-01T00:00:00.000Z'),
    });

    await service
      .createPublicBooking(
        'business-1',
        { ...dto, lastName: undefined },
        publicAttribution,
        directTraffic,
      )
      .then(
        () => null,
        () => null,
      );

    expect(clients.resolveForBooking).toHaveBeenCalledWith(
      'brand-1',
      dto.phone,
      dto.firstName,
      '',
      undefined,
    );
  });

  it('rejects online booking without client identity even if anonymous is sent', async () => {
    const { service, clients } = setup();

    const error = await service
      .createPublicBooking(
        'business-1',
        {
          ...dto,
          firstName: undefined,
          phone: undefined,
          anonymous: true,
        } as never,
        publicAttribution,
        directTraffic,
      )
      .then(
        () => null,
        (caught: unknown) => caught,
      );

    expect(error).toBeInstanceOf(Error);
    expect((error as { getStatus: () => number }).getStatus()).toBe(
      HttpStatus.BAD_REQUEST,
    );
    expect(clients.resolveForBooking).not.toHaveBeenCalled();
  });
});

describe('BookingCreateFacade online booking availability', () => {
  it('rejects a public booking while the brand subscription blocks online booking', async () => {
    const billing = { isOnlineBookingOpen: vi.fn().mockResolvedValue(false) };
    const { service, clients, staff, db } = setup(billing);
    const transaction = vi.fn();
    Object.assign(db, { $transaction: transaction });

    const error = await service
      .createPublicBooking('business-1', dto, publicAttribution, directTraffic)
      .then(
        () => null,
        (caught: unknown) => caught,
      );

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).errorCode).toBe(
      'ONLINE_BOOKING_UNAVAILABLE',
    );
    expect((error as AppException).getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect(billing.isOnlineBookingOpen).toHaveBeenCalledWith('brand-1');
    expect(clients.resolveForBooking).not.toHaveBeenCalled();
    expect(staff.resolveStaffForService).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe('BookingCreateFacade pricing', () => {
  it('calculates service and product prices without writing to the database', async () => {
    const { service, db, orders } = pricingSetup();

    const result = await service.price('business-1', {
      items: [{ serviceId: 'service-1', customPrice: '40.00' }],
      products: [
        {
          productId: 'product-1',
          quantity: '2.000',
          customUnitPrice: '15.00',
        },
      ],
    });

    expect(result.currency).toBe('BYN');
    expect(result.serviceTotal.toFixed(2)).toBe('40.00');
    expect(result.productTotal.toFixed(2)).toBe('30.00');
    expect(result.totalAmount.toFixed(2)).toBe('70.00');
    expect(result.items).toHaveLength(2);
    expect(orders.priceProductItems).toHaveBeenCalledWith('business-1', [
      {
        productId: 'product-1',
        quantity: '2.000',
        customUnitPrice: '15.00',
      },
    ]);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe('BookingCreateFacade calendar link', () => {
  it('creates the linked calendar event as a booking event', async () => {
    const bookingCreatedAt = new Date('2026-09-19T10:05:00.000Z');
    const clients = {
      recordAcquisition: vi.fn().mockResolvedValue(true),
      resolveForBooking: vi.fn().mockResolvedValue({
        id: 'client-1',
        firstName: 'Анна',
        lastName: 'Иванова',
        phone: '+375291112233',
        email: null,
        bannedAt: null,
      }),
    };
    const calendar = {
      filterAvailableStaff: vi.fn().mockResolvedValue([{ id: 'staff-1' }]),
      isSlotFree: vi.fn().mockReturnValue(true),
      listBlockingEvents: vi.fn(
        (_locationId, _staffIds, _startAt, _endAt, _excluded, tx) =>
          tx.calendarEvent.findMany(),
      ),
      createBookingEvent: vi.fn((input, tx) =>
        tx.calendarEvent.create({
          data: {
            locationId: input.locationId,
            staffId: input.staffId,
            type: CalendarEventType.BOOKING,
            repeatType: CalendarEventRepeatType.NONE,
            startDateTime: input.startAt,
            endDateTime: input.endAt,
          },
        }),
      ),
    };
    const staff = {
      resolveStaffForService: vi.fn().mockResolvedValue([{ id: 'staff-1' }]),
      findShiftForDate: vi.fn((_staffId, _date, tx) =>
        tx.staffShift.findFirst(),
      ),
      findById: vi.fn().mockResolvedValue({ id: 'staff-1', name: 'Мария' }),
    };
    const tx = {
      $executeRaw: vi.fn(),
      staffShift: {
        findFirst: vi.fn().mockResolvedValue({
          startTime: new Date('1970-01-01T06:00:00.000Z'),
          endTime: new Date('1970-01-01T18:00:00.000Z'),
        }),
      },
      calendarEvent: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: 'event-1' }),
      },
      booking: {
        create: vi.fn().mockResolvedValue({
          id: 'booking-1',
          locationId: 'business-1',
          serviceId: 'service-1',
          staffId: 'staff-1',
          clientId: 'client-1',
          startAt: new Date('2026-09-20T07:00:00.000Z'),
          endAt: new Date('2026-09-20T08:00:00.000Z'),
          status: BookingStatus.CONFIRMED,
          clientFirstName: 'Анна',
          clientLastName: 'Иванова',
          clientPhone: '+375291112233',
          clientEmail: null,
          serviceTitle: 'Стрижка',
          serviceDuration: 60,
          servicePrice: 50,
          customPrice: null,
          staffName: 'Мария',
          calendarEventId: 'event-1',
          createdAt: bookingCreatedAt,
          items: [
            {
              id: 'booking-item-1',
              bookingId: 'booking-1',
              locationId: 'business-1',
              serviceId: 'service-1',
              staffId: 'staff-1',
              sortOrder: 0,
              startAt: new Date('2026-09-20T07:00:00.000Z'),
              endAt: new Date('2026-09-20T08:00:00.000Z'),
              serviceTitle: 'РЎС‚СЂРёР¶РєР°',
              serviceDuration: 60,
              listPrice: 50,
              chargedPrice: 50,
              customPrice: null,
              staffName: 'РњР°СЂРёСЏ',
              calendarEventId: 'event-1',
            },
          ],
        }),
      },
    };
    const db = {
      location: {
        findUnique: vi.fn().mockResolvedValue({
          brandId: 'brand-1',
          isBookingConfirmationRequired: false,
          timezone: 'Europe/Minsk',
          bookingVisibility: BookingVisibility.PUBLIC,
          currency: 'BYN',
        }),
      },
      service: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'service-1',
            title: 'Стрижка',
            durationMinutes: 60,
            bufferMinutes: 0,
            price: 50,
          },
        ]),
      },
      bookingItem: { groupBy: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn((fn: (client: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };

    const service = createBookingService(
      db as never,
      calendar as never,
      clients as never,
      staff as never,
      { emit: vi.fn() } as never,
      { generateClientToken: vi.fn(), managementUrl: vi.fn() } as never,
      ...channelDeps(),
      ...commercialDeps(),
      ...catalogDeps(db),
    );

    const touch = {
      utmSource: 'ig',
      utmMedium: null,
      utmCampaign: 'spring',
      utmContent: null,
      utmTerm: null,
      referrerHost: 'l.instagram.com',
      clickIdType: null,
      clickId: null,
      touchedAt: new Date('2026-09-19T10:00:00.000Z'),
    };
    await service.createPublicBooking('business-1', dto, publicAttribution, {
      source: TrafficSource.INSTAGRAM,
      detail: null,
      touch,
    });

    expect(tx.booking.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          trafficSource: TrafficSource.INSTAGRAM,
          trafficSourceDetail: null,
          trafficTouch: { create: touch },
        }),
      }),
    );
    expect(clients.recordAcquisition).toHaveBeenCalledWith(
      'client-1',
      {
        bookingId: 'booking-1',
        source: TrafficSource.INSTAGRAM,
        detail: null,
        acquiredAt: bookingCreatedAt,
      },
      tx,
    );
    expect(tx.calendarEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        locationId: 'business-1',
        staffId: 'staff-1',
        type: CalendarEventType.BOOKING,
        repeatType: CalendarEventRepeatType.NONE,
      }),
    });
    expect(tx.booking.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          channel: BookingChannel.PUBLIC_PAGE,
          isCustomTime: false,
          bookingPageId: null,
          bookingWidgetId: null,
          clientLastName: 'Иванова',
        }),
        include: expect.objectContaining({ items: expect.any(Object) }),
      }),
    );
  });
});

describe('BookingCreateFacade manual item prices', () => {
  it('stores each item custom price and leaves the others on the catalog price', async () => {
    const clients = {
      resolveForBooking: vi.fn().mockResolvedValue({
        id: 'client-1',
        firstName: 'Анна',
        lastName: 'Иванова',
        phone: '+375291112233',
        email: null,
        bannedAt: null,
      }),
    };
    const calendar = {
      filterAvailableStaff: vi.fn().mockResolvedValue([{ id: 'staff-1' }]),
      isSlotFree: vi.fn().mockReturnValue(true),
      listBlockingEvents: vi.fn(
        (_locationId, _staffIds, _startAt, _endAt, _excluded, tx) =>
          tx.calendarEvent.findMany(),
      ),
      createBookingEvent: vi.fn((input, tx) =>
        tx.calendarEvent.create({
          data: {
            locationId: input.locationId,
            staffId: input.staffId,
            type: CalendarEventType.BOOKING,
            repeatType: CalendarEventRepeatType.NONE,
            startDateTime: input.startAt,
            endDateTime: input.endAt,
          },
        }),
      ),
    };
    const staff = {
      resolveStaffForService: vi.fn().mockResolvedValue([{ id: 'staff-1' }]),
      findShiftForDate: vi.fn((_staffId, _date, tx) =>
        tx.staffShift.findFirst(),
      ),
      findById: vi.fn().mockResolvedValue({ id: 'staff-1', name: 'Мария' }),
    };
    const tx = {
      $executeRaw: vi.fn(),
      staffShift: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ startTime: new Date(), endTime: new Date() }),
      },
      calendarEvent: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: 'event-1' }),
      },
      booking: {
        create: vi.fn().mockResolvedValue({
          id: 'booking-1',
          locationId: 'business-1',
          clientFirstName: 'Анна',
          clientLastName: 'Иванова',
          clientEmail: null,
          startAt: new Date('2026-09-20T07:00:00.000Z'),
          endAt: new Date('2026-09-20T09:00:00.000Z'),
          items: [],
        }),
      },
    };
    const db = {
      location: {
        findUnique: vi.fn().mockResolvedValue({
          brandId: 'brand-1',
          isBookingConfirmationRequired: false,
          timezone: 'Europe/Minsk',
          bookingVisibility: BookingVisibility.PUBLIC,
          currency: 'BYN',
        }),
      },
      service: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'service-1',
            title: 'Стрижка',
            durationMinutes: 60,
            bufferMinutes: 0,
            price: 50,
          },
          {
            id: 'service-2',
            title: 'Окрашивание',
            durationMinutes: 60,
            bufferMinutes: 0,
            price: 80,
          },
        ]),
      },
      bookingItem: { groupBy: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn((fn: (client: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };
    const service = createBookingService(
      db as never,
      calendar as never,
      clients as never,
      staff as never,
      { emit: vi.fn() } as never,
      { generateClientToken: vi.fn(), managementUrl: vi.fn() } as never,
      ...channelDeps(),
      ...commercialDeps(),
      ...catalogDeps(db),
    );

    await service.createManualBooking(
      'business-1',
      {
        ...dto,
        serviceId: undefined,
        items: [
          { serviceId: 'service-1' },
          { serviceId: 'service-2', customPrice: '70.00' },
        ],
      },
      { id: 'user-1', name: 'Ольга', role: AuditActorRole.OWNER },
    );

    const created = tx.booking.create.mock.calls[0][0] as {
      data: { items: { create: { customPrice: string | null }[] } };
    };
    expect(created.data.items.create.map((item) => item.customPrice)).toEqual([
      null,
      '70.00',
    ]);
  });
});

function customTimeSetup(
  options: {
    isSlotFree?: boolean;
    serviceDurationMinutes?: number;
    serviceBufferMinutes?: number;
  } = {},
) {
  const clients = {
    resolveForBooking: vi.fn().mockResolvedValue({
      id: 'client-1',
      firstName: 'Anna',
      lastName: 'Ivanova',
      phone: '+375291112233',
      email: null,
      bannedAt: null,
    }),
    findForBooking: vi.fn().mockResolvedValue(null),
    fillMissingEmail: vi.fn(async (_clientId: string, email: string) => email),
    emitEmailFilled: vi.fn(),
  };
  const calendar = {
    filterAvailableStaff: vi.fn().mockResolvedValue([{ id: 'staff-1' }]),
    isSlotFree: vi.fn().mockReturnValue(options.isSlotFree ?? true),
    listBlockingEvents: vi.fn(
      (_locationId, _staffIds, _startAt, _endAt, _excluded, tx) =>
        tx.calendarEvent.findMany(),
    ),
    createBookingEvent: vi.fn((input, tx) =>
      tx.calendarEvent.create({
        data: {
          locationId: input.locationId,
          staffId: input.staffId,
          type: CalendarEventType.BOOKING,
          repeatType: CalendarEventRepeatType.NONE,
          startDateTime: input.startAt,
          endDateTime: input.endAt,
        },
      }),
    ),
  };
  const staff = {
    resolveStaffForService: vi.fn().mockResolvedValue([{ id: 'staff-1' }]),
    findShiftForDate: vi.fn((_staffId, _date, tx) => tx.staffShift.findFirst()),
    findById: vi.fn().mockResolvedValue({ id: 'staff-1', name: 'Maria' }),
  };
  const tx = {
    $executeRaw: vi.fn(),
    staffShift: {
      findFirst: vi.fn().mockResolvedValue({
        startTime: new Date('1970-01-01T06:00:00.000Z'),
        endTime: new Date('1970-01-01T18:00:00.000Z'),
      }),
    },
    calendarEvent: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'event-1' }),
    },
    booking: {
      create: vi.fn(
        (args: {
          data: {
            startAt: Date;
            endAt: Date;
            status: BookingStatus;
            channel: BookingChannel;
            isCustomTime: boolean;
            executionMode: string;
            clientId: string | null;
            clientFirstName: string;
            clientLastName: string;
            clientPhone: string | null;
            clientEmail: string | null;
            internalNotes?: string | null;
            notifyClient?: boolean;
            clientNoticeAt?: Date | null;
            clientNoticeType?: ClientNoticeType | null;
            items: {
              create: {
                startAt: Date;
                endAt: Date;
              }[];
            };
          };
        }) =>
          Promise.resolve({
            id: 'booking-1',
            locationId: 'business-1',
            clientId: args.data.clientId,
            startAt: args.data.startAt,
            endAt: args.data.endAt,
            status: args.data.status,
            channel: args.data.channel,
            isCustomTime: args.data.isCustomTime,
            executionMode: args.data.executionMode,
            bundleId: null,
            clientFirstName: args.data.clientFirstName,
            clientLastName: args.data.clientLastName,
            clientPhone: args.data.clientPhone,
            clientEmail: args.data.clientEmail,
            notes: null,
            internalNotes: args.data.internalNotes ?? null,
            items: args.data.items.create.map((item, index) => ({
              id: `booking-item-${index + 1}`,
              bookingId: 'booking-1',
              ...item,
            })),
          }),
      ),
    },
  };
  const db = {
    location: {
      findUnique: vi.fn().mockResolvedValue({
        brandId: 'brand-1',
        isBookingConfirmationRequired: true,
        timezone: 'Europe/Minsk',
        bookingVisibility: BookingVisibility.PUBLIC,
        currency: 'BYN',
      }),
    },
    service: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'service-1',
          title: 'Haircut',
          durationMinutes: options.serviceDurationMinutes ?? 60,
          bufferMinutes: options.serviceBufferMinutes ?? 0,
          price: 50,
        },
      ]),
    },
    bookingItem: { groupBy: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn((fn: (client: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
  };
  const orders = {
    syncCompletedBooking: vi
      .fn()
      .mockResolvedValue({ id: 'order-1', items: [] }),
    addDraftProductsToBookingOrder: vi.fn().mockResolvedValue({
      order: { id: 'order-1', items: [] },
      brandId: 'brand-1',
      auditPayload: {},
    }),
    publishDraftProductsAdded: vi.fn(),
  };
  const earnings = {
    recordForCompletedBooking: vi.fn().mockResolvedValue([]),
    syncForCompletedBooking: vi.fn().mockResolvedValue([]),
  };
  const emitter = { emit: vi.fn() };
  const service = createBookingService(
    db as never,
    calendar as never,
    clients as never,
    staff as never,
    emitter as never,
    { generateClientToken: vi.fn(), managementUrl: vi.fn() } as never,
    ...channelDeps(),
    orders as never,
    new OrderPricingCalculator(),
    earnings as never,
    ...catalogDeps(db),
  );
  return {
    service,
    tx,
    db,
    calendar,
    clients,
    staff,
    orders,
    earnings,
    emitter,
  };
}

describe('BookingCreateFacade custom time', () => {
  it.each([undefined, false])(
    'keeps ordinary manual creation behavior when isCustomTime is %s',
    async (isCustomTime) => {
      const { service, tx, orders, earnings } = customTimeSetup();

      const booking = await service.createManualBooking(
        'business-1',
        {
          ...dto,
          isCustomTime,
          startAt: '2020-09-20T10:04:00',
          endAt: '2020-09-20T10:30:00',
        },
        { id: 'user-1', name: 'Olga', role: AuditActorRole.OWNER },
      );

      expect(booking.channel).toBe(BookingChannel.MANUAL);
      expect(booking.isCustomTime).toBe(false);
      expect(booking.status).toBe(BookingStatus.CONFIRMED);
      expect(booking.endAt.toISOString()).toBe('2020-09-20T08:04:00.000Z');
      expect(tx.booking.create).toHaveBeenCalledOnce();
      expect(orders.syncCompletedBooking).not.toHaveBeenCalled();
      expect(earnings.recordForCompletedBooking).not.toHaveBeenCalled();
    },
  );

  it('stores the source staff picked, without a touch', async () => {
    const { service, tx } = customTimeSetup();

    await service.createManualBooking(
      'business-1',
      {
        ...dto,
        startAt: '2099-09-20T10:00:00',
        trafficSource: TrafficSource.PHONE_CALL,
        trafficSourceDetail: '  реклама на радио ',
      },
      { id: 'user-1', name: 'Olga', role: AuditActorRole.OWNER },
    );

    expect(tx.booking.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          channel: BookingChannel.MANUAL,
          trafficSource: TrafficSource.PHONE_CALL,
          trafficSourceDetail: 'реклама на радио',
          trafficTouch: undefined,
        }),
      }),
    );
  });

  it('leaves the source of a manual booking unset when staff picked none', async () => {
    const { service, tx } = customTimeSetup();

    await service.createManualBooking(
      'business-1',
      { ...dto, startAt: '2099-09-20T10:00:00' },
      { id: 'user-1', name: 'Olga', role: AuditActorRole.OWNER },
    );

    expect(tx.booking.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          trafficSource: null,
          trafficSourceDetail: null,
        }),
      }),
    );
  });

  it('rejects a source detail without a source before writing', async () => {
    const { service, tx } = customTimeSetup();

    await expect(
      service.createManualBooking(
        'business-1',
        { ...dto, startAt: '2099-09-20T10:00:00', trafficSourceDetail: 'x' },
        { id: 'user-1', name: 'Olga', role: AuditActorRole.OWNER },
      ),
    ).rejects.toMatchObject({
      errorCode: 'TRAFFIC_SOURCE_DETAIL_WITHOUT_SOURCE',
    });
    expect(tx.booking.create).not.toHaveBeenCalled();
  });

  it('confirms a manual booking even when the location requires confirmation', async () => {
    const { service } = customTimeSetup();

    const booking = await service.createManualBooking(
      'business-1',
      { ...dto, startAt: '2099-09-20T10:00:00' },
      { id: 'user-1', name: 'Olga', role: AuditActorRole.OWNER },
    );

    expect(booking.status).toBe(BookingStatus.CONFIRMED);
  });

  it.each([
    [undefined, true, true],
    [undefined, false, false],
    [true, false, true],
    [false, true, false],
  ])(
    'queues the client email for a manual booking when notifyClient is %s and the location setting is %s',
    async (notifyClient, setting, queued) => {
      const { service, tx, db, clients, emitter } = customTimeSetup();
      db.location.findUnique.mockResolvedValue({
        ...(await db.location.findUnique()),
        notifyClientOnStaffChanges: setting,
      });
      clients.resolveForBooking.mockResolvedValue({
        id: 'client-1',
        firstName: 'Anna',
        lastName: 'Ivanova',
        phone: '+375291112233',
        email: 'anna@example.test',
        bannedAt: null,
      });

      const before = Date.now();
      await service.createManualBooking(
        'business-1',
        { ...dto, startAt: '2099-09-20T10:00:00', notifyClient },
        { id: 'user-1', name: 'Olga', role: AuditActorRole.OWNER },
      );

      const data = tx.booking.create.mock.calls[0][0].data;
      expect(data.notifyClient).toBe(queued);
      if (queued) {
        expect(data.clientNoticeType).toBe(ClientNoticeType.CREATED);
        expect(data.clientNoticeAt?.getTime()).toBeGreaterThanOrEqual(
          before + CLIENT_NOTICE_DELAY_MS,
        );
      } else {
        expect(data.clientNoticeAt).toBeNull();
        expect(data.clientNoticeType).toBeNull();
      }
      expect(
        emitter.emit.mock.calls.filter(
          ([event]) => event === NOTIFICATION_EVENT,
        ),
      ).toHaveLength(0);
    },
  );

  it('resolves a client automatically for manual booking without a client-management flag', async () => {
    const { service, tx, clients } = customTimeSetup();

    await service.createManualBooking('business-1', dto, {
      id: 'user-1',
      name: 'Staff',
      role: AuditActorRole.STAFF,
    });

    expect(clients.resolveForBooking).toHaveBeenCalledWith(
      'brand-1',
      dto.phone,
      dto.firstName,
      dto.lastName,
      undefined,
    );
    expect(tx.booking.create).toHaveBeenCalled();
  });

  it('creates anonymous manual booking without creating or linking a client', async () => {
    const { service, tx, clients } = customTimeSetup();

    await service.createManualBooking(
      'business-1',
      {
        serviceId: 'service-1',
        staffId: 'staff-1',
        startAt: '2026-09-20T10:04:00',
        anonymous: true,
      } as never,
      { id: 'user-1', name: 'Olga', role: AuditActorRole.OWNER },
    );

    const created = tx.booking.create.mock.calls[0][0] as {
      data: {
        clientId: string | null;
        clientFirstName: string;
        clientLastName: string;
        clientPhone: string | null;
        clientEmail: string | null;
      };
    };
    expect(clients.resolveForBooking).not.toHaveBeenCalled();
    expect(created.data.clientId).toBeNull();
    expect(created.data.clientFirstName).toBe('');
    expect(created.data.clientLastName).toBe('');
    expect(created.data.clientPhone).toBeNull();
    expect(created.data.clientEmail).toBeNull();
  });

  it('stores optional anonymous contact snapshot without creating a client', async () => {
    const { service, tx, clients } = customTimeSetup();

    await service.createManualBooking(
      'business-1',
      {
        ...dto,
        anonymous: true,
        firstName: 'Guest',
        lastName: 'One',
      },
      { id: 'user-1', name: 'Olga', role: AuditActorRole.OWNER },
    );

    const created = tx.booking.create.mock.calls[0][0] as {
      data: {
        clientId: string | null;
        clientFirstName: string;
        clientLastName: string;
        clientPhone: string | null;
      };
    };
    expect(clients.resolveForBooking).not.toHaveBeenCalled();
    expect(created.data.clientId).toBeNull();
    expect(created.data.clientFirstName).toBe('Guest');
    expect(created.data.clientLastName).toBe('One');
    expect(created.data.clientPhone).toBe(dto.phone);
  });

  it('stores internal notes and draft products atomically on manual create', async () => {
    const { service, tx, orders } = customTimeSetup();
    const actor = { id: 'user-1', name: 'Olga', role: AuditActorRole.OWNER };
    const products = [
      {
        productId: 'product-1',
        quantity: '2.000',
        sellerStaffId: 'staff-1',
        customUnitPrice: '15.00',
      },
      {
        productId: 'product-2',
        quantity: '1.000',
        sellerStaffId: null,
        customUnitPrice: null,
      },
    ];

    await service.createManualBooking(
      'business-1',
      {
        ...dto,
        internalNotes: 'Prepare retail products',
        products,
      },
      actor,
    );

    const created = tx.booking.create.mock.calls[0][0] as {
      data: { internalNotes: string | null };
    };
    const booking = await tx.booking.create.mock.results[0].value;
    expect(created.data.internalNotes).toBe('Prepare retail products');
    expect(orders.addDraftProductsToBookingOrder).toHaveBeenCalledWith(
      booking,
      products,
      actor,
      tx,
      true,
    );
  });

  it('lets a master complete their elapsed custom-time visit like a status change', async () => {
    const { service, tx, orders, earnings } = customTimeSetup();
    await service.createManualBooking(
      'business-1',
      {
        ...dto,
        isCustomTime: true,
        startAt: '2020-09-20T10:04:00',
        endAt: '2020-09-20T10:30:00',
      },
      { id: 'user-1', name: 'Staff', role: AuditActorRole.STAFF },
      'staff-1',
    );
    expect(tx.booking.create.mock.calls[0][0].data.status).toBe(
      BookingStatus.COMPLETED,
    );
    expect(orders.syncCompletedBooking).toHaveBeenCalledOnce();
    expect(earnings.recordForCompletedBooking).toHaveBeenCalledOnce();
    expect(earnings.syncForCompletedBooking).toHaveBeenCalledOnce();
  });

  it('keeps an ongoing booking with custom time confirmed under the manual channel', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-20T07:10:00.000Z'));
    try {
      const { service, tx, orders, earnings } = customTimeSetup();

      await service.createManualBooking(
        'business-1',
        {
          ...dto,
          isCustomTime: true,
          startAt: '2026-09-20T10:04:00',
          endAt: '2026-09-20T10:30:00',
        },
        { id: 'user-1', name: 'Olga', role: AuditActorRole.OWNER },
      );

      const created = tx.booking.create.mock.calls[0][0] as {
        data: {
          startAt: Date;
          endAt: Date;
          status: BookingStatus;
          channel: BookingChannel;
          isCustomTime: boolean;
          items: { create: { startAt: Date; endAt: Date }[] };
        };
      };
      expect(created.data.channel).toBe(BookingChannel.MANUAL);
      expect(created.data.isCustomTime).toBe(true);
      expect(created.data.status).toBe(BookingStatus.CONFIRMED);
      expect(created.data.startAt.toISOString()).toBe(
        '2026-09-20T07:04:00.000Z',
      );
      expect(created.data.endAt.toISOString()).toBe('2026-09-20T07:30:00.000Z');
      expect(created.data.items.create[0].startAt.toISOString()).toBe(
        '2026-09-20T07:04:00.000Z',
      );
      expect(created.data.items.create[0].endAt.toISOString()).toBe(
        '2026-09-20T07:30:00.000Z',
      );
      expect(orders.syncCompletedBooking).not.toHaveBeenCalled();
      expect(earnings.recordForCompletedBooking).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('books custom time over a busy interval of the staff member', async () => {
    const { service, tx, calendar } = customTimeSetup({ isSlotFree: false });
    calendar.filterAvailableStaff.mockResolvedValue([]);

    const booking = await service.createManualBooking(
      'business-1',
      {
        ...dto,
        isCustomTime: true,
        startAt: '2099-09-20T10:04:00',
        endAt: '2099-09-20T10:30:00',
      },
      { id: 'user-1', name: 'Olga', role: AuditActorRole.OWNER },
    );

    expect(booking.status).toBe(BookingStatus.CONFIRMED);
    expect(tx.booking.create).toHaveBeenCalledOnce();
    expect(calendar.isSlotFree).not.toHaveBeenCalled();
  });

  it('still rejects an ordinary manual booking over a busy interval', async () => {
    const { service, tx } = customTimeSetup({ isSlotFree: false });

    await expect(
      service.createManualBooking(
        'business-1',
        { ...dto, startAt: '2099-09-20T10:04:00' },
        { id: 'user-1', name: 'Olga', role: AuditActorRole.OWNER },
      ),
    ).rejects.toMatchObject({ errorCode: 'BOOKING_SLOT_UNAVAILABLE' });
    expect(tx.booking.create).not.toHaveBeenCalled();
  });

  it('completes an elapsed booking with custom time under the manual channel and syncs order and earnings', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-20T07:30:00.000Z'));
    try {
      const { service, tx, orders, earnings } = customTimeSetup();

      await service.createManualBooking(
        'business-1',
        {
          ...dto,
          isCustomTime: true,
          startAt: '2026-09-20T10:04:00',
          endAt: '2026-09-20T10:30:00',
        },
        { id: 'user-1', name: 'Olga', role: AuditActorRole.OWNER },
      );

      const booking = await tx.booking.create.mock.results[0].value;
      expect(booking.channel).toBe(BookingChannel.MANUAL);
      expect(booking.isCustomTime).toBe(true);
      expect(booking.status).toBe(BookingStatus.COMPLETED);
      expect(orders.syncCompletedBooking).toHaveBeenCalledWith(
        booking,
        expect.objectContaining({ name: 'Olga' }),
        tx,
      );
      expect(earnings.recordForCompletedBooking).toHaveBeenCalledWith(
        booking,
        tx,
        { id: 'order-1', items: [] },
      );
      expect(earnings.syncForCompletedBooking).toHaveBeenCalledWith(
        booking,
        expect.objectContaining({ name: 'Olga' }),
        tx,
        { id: 'order-1', items: [] },
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('BookingCreateFacade manual status', () => {
  const owner = { id: 'user-1', name: 'Olga', role: AuditActorRole.OWNER };
  const elapsed = { startAt: '2026-09-20T10:00:00' };
  const now = new Date('2026-09-20T07:30:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
  });
  afterEach(() => vi.useRealTimers());

  it.each([BookingStatus.PENDING, BookingStatus.CONFIRMED] as const)(
    'stores an explicit %s status for an upcoming visit',
    async (status) => {
      const { service, tx } = customTimeSetup();
      await service.createManualBooking(
        'business-1',
        { ...dto, startAt: '2026-09-21T10:00:00', status },
        owner,
      );
      expect(tx.booking.create.mock.calls[0][0].data.status).toBe(status);
    },
  );

  it('prefers the explicit status over custom time', async () => {
    const { service, tx, orders } = customTimeSetup();
    await service.createManualBooking(
      'business-1',
      {
        ...dto,
        ...elapsed,
        isCustomTime: true,
        status: BookingStatus.CONFIRMED,
      },
      owner,
    );
    expect(tx.booking.create.mock.calls[0][0].data.status).toBe(
      BookingStatus.CONFIRMED,
    );
    expect(orders.syncCompletedBooking).not.toHaveBeenCalled();
  });

  it.each([BookingStatus.COMPLETED, BookingStatus.NO_SHOW] as const)(
    'rejects %s for a visit that has not started',
    async (status) => {
      const { service, tx, clients } = customTimeSetup();
      const error = await service
        .createManualBooking(
          'business-1',
          { ...dto, startAt: '2026-09-20T10:31:00', status },
          owner,
        )
        .catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).errorCode).toBe(
        'BOOKING_STATUS_BEFORE_START',
      );
      expect((error as AppException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(clients.resolveForBooking).not.toHaveBeenCalled();
      expect(tx.booking.create).not.toHaveBeenCalled();
    },
  );

  it('completes a started visit with the usual order and payroll sync, without an email', async () => {
    const { service, tx, orders, earnings, clients } = customTimeSetup();
    clients.resolveForBooking.mockResolvedValue({
      id: 'client-1',
      firstName: 'Anna',
      lastName: 'Ivanova',
      phone: '+375291112233',
      email: 'anna@example.test',
      bannedAt: null,
    });
    await service.createManualBooking(
      'business-1',
      { ...dto, ...elapsed, status: BookingStatus.COMPLETED },
      owner,
    );
    const data = tx.booking.create.mock.calls[0][0].data;
    expect(data.status).toBe(BookingStatus.COMPLETED);
    expect(data.clientNoticeType).toBeNull();
    expect(orders.syncCompletedBooking).toHaveBeenCalledOnce();
    expect(earnings.recordForCompletedBooking).toHaveBeenCalledOnce();
  });

  it('lets a master create their own started visit as COMPLETED', async () => {
    const { service, tx, orders } = customTimeSetup();
    await service.createManualBooking(
      'business-1',
      { ...dto, ...elapsed, status: BookingStatus.COMPLETED },
      { id: 'user-2', name: 'Anna', role: AuditActorRole.STAFF },
      'staff-1',
    );
    expect(tx.booking.create.mock.calls[0][0].data.status).toBe(
      BookingStatus.COMPLETED,
    );
    expect(orders.syncCompletedBooking).toHaveBeenCalledOnce();
  });

  it('records a no-show of a started visit without payroll or email', async () => {
    const { service, tx, orders, earnings, clients } = customTimeSetup();
    clients.resolveForBooking.mockResolvedValue({
      id: 'client-1',
      firstName: 'Anna',
      lastName: 'Ivanova',
      phone: '+375291112233',
      email: 'anna@example.test',
      bannedAt: null,
    });
    await service.createManualBooking(
      'business-1',
      { ...dto, startAt: '2026-09-20T10:15:00', status: BookingStatus.NO_SHOW },
      owner,
    );
    const data = tx.booking.create.mock.calls[0][0].data;
    expect(data.status).toBe(BookingStatus.NO_SHOW);
    expect(data.clientNoticeAt).toBeNull();
    expect(orders.syncCompletedBooking).not.toHaveBeenCalled();
    expect(earnings.recordForCompletedBooking).not.toHaveBeenCalled();
  });

  it('records the creation status in the audit entry', async () => {
    const { service, emitter } = customTimeSetup();
    await service.createManualBooking(
      'business-1',
      { ...dto, ...elapsed, status: BookingStatus.NO_SHOW },
      owner,
    );
    expect(emitter.emit).toHaveBeenCalledWith(
      AUDIT_EVENT,
      expect.objectContaining({
        payload: expect.objectContaining({ status: BookingStatus.NO_SHOW }),
      }),
    );
  });
});

describe('BookingCreateFacade manual client', () => {
  const owner = { id: 'user-1', name: 'Olga', role: AuditActorRole.OWNER };
  const stored = {
    id: 'client-7',
    brandId: 'brand-1',
    firstName: 'Мария',
    lastName: 'Петрова',
    phone: '+375297776655',
    email: null,
    bannedAt: null,
  };
  const upcoming = { startAt: '2099-09-20T10:00:00' };

  it('books the selected client by id with the profile contacts', async () => {
    const { service, tx, clients } = customTimeSetup();
    clients.findForBooking.mockResolvedValue({
      ...stored,
      email: 'maria@example.test',
    });
    await service.createManualBooking(
      'business-1',
      {
        ...upcoming,
        serviceId: 'service-1',
        staffId: 'staff-1',
        clientId: 'client-7',
      } as ManualCreateBookingDto,
      owner,
    );
    const data = tx.booking.create.mock.calls[0][0].data;
    expect(clients.findForBooking).toHaveBeenCalledWith('brand-1', 'client-7');
    expect(clients.resolveForBooking).not.toHaveBeenCalled();
    expect(data.clientId).toBe('client-7');
    expect(data.clientFirstName).toBe('Мария');
    expect(data.clientPhone).toBe('+375297776655');
    expect(data.clientEmail).toBe('maria@example.test');
    expect(clients.fillMissingEmail).not.toHaveBeenCalled();
  });

  it('ignores request name and phone when a client id is given', async () => {
    const { service, tx, clients } = customTimeSetup();
    clients.findForBooking.mockResolvedValue(stored);
    await service.createManualBooking(
      'business-1',
      { ...dto, ...upcoming, clientId: 'client-7' },
      owner,
    );
    expect(tx.booking.create.mock.calls[0][0].data.clientPhone).toBe(
      stored.phone,
    );
    expect(clients.resolveForBooking).not.toHaveBeenCalled();
  });

  it('rejects an unknown or foreign client with a coded 404 before writing', async () => {
    const { service, tx } = customTimeSetup();
    const error = await service
      .createManualBooking(
        'business-1',
        { ...dto, ...upcoming, clientId: 'client-other-brand' },
        owner,
      )
      .catch((caught: unknown) => caught);
    expect((error as AppException).errorCode).toBe('BOOKING_CLIENT_NOT_FOUND');
    expect((error as AppException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(tx.booking.create).not.toHaveBeenCalled();
  });

  it('rejects a client id on an anonymous booking', async () => {
    const { service, clients } = customTimeSetup();
    await expect(
      service.createManualBooking(
        'business-1',
        { ...dto, ...upcoming, clientId: 'client-7', anonymous: true },
        owner,
      ),
    ).rejects.toMatchObject({
      errorCode: 'BOOKING_CLIENT_CONFLICT',
      status: HttpStatus.BAD_REQUEST,
    });
    expect(clients.findForBooking).not.toHaveBeenCalled();
  });

  it('saves a typed email to a selected client without one and queues the email to it', async () => {
    const { service, tx, clients } = customTimeSetup();
    clients.findForBooking.mockResolvedValue(stored);
    await service.createManualBooking(
      'business-1',
      {
        ...dto,
        ...upcoming,
        clientId: 'client-7',
        email: 'maria@example.test',
        notifyClient: true,
      },
      owner,
    );
    expect(clients.fillMissingEmail).toHaveBeenCalledWith(
      'client-7',
      'maria@example.test',
      tx,
    );
    const data = tx.booking.create.mock.calls[0][0].data;
    expect(data.clientEmail).toBe('maria@example.test');
    expect(data.clientNoticeType).toBe(ClientNoticeType.CREATED);
    expect(clients.emitEmailFilled).toHaveBeenCalledWith(
      'brand-1',
      stored,
      'maria@example.test',
      owner,
    );
    expect(clients.emitEmailFilled.mock.invocationCallOrder[0]).toBeGreaterThan(
      tx.booking.create.mock.invocationCallOrder[0],
    );
  });

  it('keeps an email filled concurrently and does not audit a change it did not make', async () => {
    const { service, tx, clients } = customTimeSetup();
    clients.findForBooking.mockResolvedValue(stored);
    clients.fillMissingEmail.mockResolvedValue('other@example.test');
    await service.createManualBooking(
      'business-1',
      {
        ...dto,
        ...upcoming,
        clientId: 'client-7',
        email: 'maria@example.test',
      },
      owner,
    );
    expect(tx.booking.create.mock.calls[0][0].data.clientEmail).toBe(
      'other@example.test',
    );
    expect(clients.emitEmailFilled).not.toHaveBeenCalled();
  });

  it('leaves the profile unchanged when the booking cannot be reserved', async () => {
    const { service, clients } = customTimeSetup({ isSlotFree: false });
    clients.findForBooking.mockResolvedValue(stored);
    await expect(
      service.createManualBooking(
        'business-1',
        {
          ...dto,
          ...upcoming,
          clientId: 'client-7',
          email: 'maria@example.test',
        },
        owner,
      ),
    ).rejects.toMatchObject({ errorCode: 'BOOKING_SLOT_UNAVAILABLE' });
    expect(clients.fillMissingEmail).not.toHaveBeenCalled();
    expect(clients.emitEmailFilled).not.toHaveBeenCalled();
  });

  it('does not change a client found by phone', async () => {
    const { service, tx, clients } = customTimeSetup();
    await service.createManualBooking(
      'business-1',
      { ...dto, ...upcoming, email: 'anna@example.test' },
      owner,
    );
    expect(clients.fillMissingEmail).not.toHaveBeenCalled();
    expect(tx.booking.create.mock.calls[0][0].data.clientEmail).toBeNull();
  });
});

describe('BookingCreateFacade own bookings', () => {
  const master = { id: 'user-2', name: 'Anna', role: AuditActorRole.STAFF };

  it('lets a master create a booking they perform', async () => {
    const { service, tx } = customTimeSetup();
    await service.createManualBooking(
      'business-1',
      { ...dto, startAt: '2099-09-20T10:00:00' },
      master,
      'staff-1',
    );
    expect(tx.booking.create).toHaveBeenCalledOnce();
  });

  it('gives "any staff" services to the master before a less busy colleague', async () => {
    const { service, tx, staff, calendar, db } = customTimeSetup();
    const both = [{ id: 'staff-1' }, { id: 'staff-2' }];
    staff.resolveStaffForService.mockResolvedValue(both);
    calendar.filterAvailableStaff.mockResolvedValue(both);
    db.bookingItem.groupBy.mockResolvedValue([
      { staffId: 'staff-1', _count: { id: 5 } },
    ]);
    const anyStaff = { ...dto, staffId: undefined };

    await service.createManualBooking(
      'business-1',
      { ...anyStaff, startAt: '2099-09-20T10:00:00' },
      { id: 'user-1', name: 'Olga', role: AuditActorRole.OWNER },
    );
    await service.createManualBooking(
      'business-1',
      { ...anyStaff, startAt: '2099-09-20T12:00:00' },
      master,
      'staff-1',
    );

    const staffOf = (call: number) =>
      (
        tx.booking.create.mock.calls[call][0].data.items.create[0] as {
          staffId?: string;
        }
      ).staffId;
    expect(staffOf(0)).toBe('staff-2');
    expect(staffOf(1)).toBe('staff-1');
  });

  it('rejects a booking the master does not take part in', async () => {
    const { service, tx } = customTimeSetup();
    await expect(
      service.createManualBooking(
        'business-1',
        { ...dto, startAt: '2099-09-20T10:00:00' },
        master,
        'staff-2',
      ),
    ).rejects.toMatchObject({
      errorCode: 'BOOKING_OWN_STAFF_REQUIRED',
      status: HttpStatus.FORBIDDEN,
    });
    expect(tx.booking.create).not.toHaveBeenCalled();
  });
});

function createBookingService(
  db: ConstructorParameters<typeof BookingReservationService>[0],
  calendar: ConstructorParameters<typeof BookingReservationService>[2],
  clients: ConstructorParameters<typeof BookingCreateFacade>[0],
  staff: ConstructorParameters<typeof BookingSchedulingService>[1],
  emitter: ConstructorParameters<typeof BookingEventsService>[0],
  clientTokens: ConstructorParameters<typeof BookingEventsService>[1],
  limiter: ConstructorParameters<typeof BookingCreateFacade>[1],
  orders: ConstructorParameters<typeof BookingReservationService>[4],
  compute: OrderPricingCalculator,
  earnings: ConstructorParameters<typeof BookingReservationService>[5],
  services: ConstructorParameters<typeof BookingSelectionService>[1],
  location: ConstructorParameters<typeof BookingReservationService>[1],
  billing: { isOnlineBookingOpen: ReturnType<typeof vi.fn> } = {
    isOnlineBookingOpen: vi.fn().mockResolvedValue(true),
  },
): BookingCreateFacade {
  const slots = new BookingSlotLockService(staff, calendar);
  // Online booking is open unless a test says otherwise (plan section 6.2).
  const bookingLocation = Object.assign(Object.create(location), {
    getBookingSettings:
      (location as { getBookingSettings?: unknown }).getBookingSettings ??
      vi.fn().mockResolvedValue({ brandId: 'brand-1' }),
  }) as typeof location;
  // Acquisition is recorded in the reservation transaction; tests that care pass their own mock.
  const bookingClients = Object.assign(Object.create(clients), {
    recordAcquisition:
      (clients as { recordAcquisition?: unknown }).recordAcquisition ??
      vi.fn().mockResolvedValue(true),
  }) as typeof clients;
  return new BookingCreateFacade(
    bookingClients,
    limiter,
    bookingLocation,
    new BookingSelectionService(location, services, orders),
    new BookingSchedulingService(db, staff, calendar),
    new BookingEventsService(emitter, clientTokens, location, {
      notify: vi.fn(),
    } as never),
    new BookingReservationService(
      db,
      location,
      calendar,
      slots,
      orders,
      earnings,
      bookingClients,
      { plan: vi.fn().mockResolvedValue(null), publish: vi.fn() } as never,
    ),
    billing as never,
    { plan: vi.fn().mockResolvedValue(null), publish: vi.fn() } as never,
    orders,
  );
}
