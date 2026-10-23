import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { BookingSource, CancelledBy, Prisma, UserRole } from '@prisma/client';
import { booking } from './testing/factories/booking.factory.js';
import { authorizeTestToken } from '../auth/testing/factories/token-payload.factory.js';
import { DatabaseService } from '../../database/database.service.js';
import { OrderDirection } from '../../shared/enums/order-direction.enum.js';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { auditActorFromToken } from '../audit/utils/audit-actor-from-token.js';
import { TokenPayloadDto } from '../auth/dto/token-payload.dto.js';
import { CalendarFacade } from '../calendar/calendar.facade.js';
import { LocationService } from '../location/services/location.service.js';
import { OrdersFacade } from '../orders/orders.facade.js';
import { ProductsService } from '../products/services/products.service.js';
import { StaffEarningsService } from '../payroll/earnings/services/staff-earnings.service.js';
import { ServiceCatalogFacade } from '../services/catalog/service-catalog.facade.js';
import { ServiceCatalogKind } from '../services/enums/service-catalog-kind.enum.js';
import { StaffService } from '../staff/services/staff.service.js';
import { BookingsFacade } from './bookings.facade.js';
import { BookingResolveRequestDto } from './dto/booking-resolve-request.dto.js';
import { BookingSearchRequestDto } from './dto/booking-search-request.dto.js';
import { BookingSetupResponseDto } from './dto/booking-setup-response.dto.js';
import { BookingExecutionMode } from './enums/booking-execution-mode.enum.js';
import { BookingSearchOrderBy } from './enums/booking-search-order-by.enum.js';
import { BookingStatus } from './enums/booking-status.enum.js';
import { BookingWithItems } from './interfaces/booking-with-items.interface.js';
import { BookingClientTokenService } from './services/booking-client-token.service.js';
import { BookingEventsService } from './services/booking-events.service.js';
import { BookingSlotLockService } from './services/booking-slot-lock.service.js';
import { BookingWriteLockService } from './services/booking-write-lock.service.js';
import { BookingLifecycleService } from './services/write/booking-lifecycle.service.js';
import { BookingMutationService } from './services/write/booking-mutation.service.js';
import { BookingRescheduleService } from './services/write/booking-reschedule.service.js';
import { BookingCalendarReadService } from './services/read/booking-calendar-read.service.js';
import { BookingReadService } from './services/read/booking-read.service.js';
import { BookingSetupService } from './services/setup/booking-setup.service.js';

const serviceCatalog = { loadForBooking: vi.fn() };
const products = { listForPublicCatalog: vi.fn().mockResolvedValue([]) };

describe('Booking mutations during business deletion', () => {
  const now = new Date('2026-09-24T09:00:00.000Z');
  const token = authorizeTestToken({
    sub: 'owner',
    role: UserRole.ADMIN,
  } as TokenPayloadDto);
  const tx = { booking: { update: vi.fn() }, $executeRaw: vi.fn() };
  const db = { $transaction: vi.fn((callback) => callback(tx)) };
  const lifecycle = {
    findById: vi.fn().mockResolvedValue({ timezone: 'UTC' }),
    acquireActiveOperationLock: vi.fn(),
  };
  const read = { findByIdInLocation: vi.fn() };
  const calendar = { saveBookingEvent: vi.fn() };
  const mutation = createMutationService(
    db as never,
    calendar as never,
    {} as never,
    lifecycle as never,
    {} as never,
    {} as never,
    {} as never,
    read as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    read.findByIdInLocation.mockResolvedValue(booking());
    lifecycle.acquireActiveOperationLock.mockResolvedValue(false);
  });
  afterEach(() => vi.useRealTimers());

  it.each([BookingStatus.PENDING, BookingStatus.CONFIRMED] as const)(
    'does not reopen a future booking as %s in a deleted business',
    async (status) => {
      read.findByIdInLocation.mockResolvedValue(
        booking({ status: BookingStatus.CANCELLED }),
      );
      await expect(
        mutation.updateStatus(
          await read.findByIdInLocation('biz', 'booking-1'),
          auditActorFromToken(token, 'biz'),
          { status },
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.booking.update).not.toHaveBeenCalled();
      expect(lifecycle.acquireActiveOperationLock).toHaveBeenCalledWith(
        'biz',
        tx,
      );
    },
  );

  it.each([
    { startAt: '2026-09-25T10:00:00' },
    { startAt: '2026-09-25T10:00:00', endAt: '2026-09-25T11:00:00' },
  ])(
    'does not move an open booking into the future after deletion: %j',
    async (dto) => {
      await expect(
        mutation.update(
          await read.findByIdInLocation('biz', 'booking-1'),
          auditActorFromToken(token, 'biz'),
          dto,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(tx.booking.update).not.toHaveBeenCalled();
      expect(calendar.saveBookingEvent).not.toHaveBeenCalled();
      expect(tx.$executeRaw).not.toHaveBeenCalled();
    },
  );
});

describe('BookingsFacade.completeElapsed', () => {
  const db = {
    booking: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  } as any;
  db.$transaction = vi.fn((callback) => callback(db));
  const earnings = {
    recordForCompletedBooking: vi.fn(),
    syncForCompletedBooking: vi.fn(),
  };
  const order = { id: 'order-1', items: [] };
  const orders = {
    syncCompletedBooking: vi.fn().mockResolvedValue(order),
  };
  const emitter = { emit: vi.fn() };

  let service: BookingsFacade;
  const businessLifecycle = {
    getAutomaticProcessingCutoffs: vi.fn(),
    acquireActiveOperationLock: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    businessLifecycle.getAutomaticProcessingCutoffs.mockResolvedValue(
      new Map([['biz', null]]),
    );
    businessLifecycle.acquireActiveOperationLock.mockResolvedValue(true);
    const module = await Test.createTestingModule({
      providers: [
        BookingsFacade,
        BookingMutationService,
        { provide: BookingClientTokenService, useValue: {} },
        BookingRescheduleService,
        BookingLifecycleService,
        BookingWriteLockService,
        BookingEventsService,
        BookingSlotLockService,
        BookingReadService,
        BookingSetupService,
        { provide: ProductsService, useValue: products },
        { provide: DatabaseService, useValue: db },
        { provide: CalendarFacade, useValue: { deleteBookingEvents: vi.fn() } },
        { provide: StaffService, useValue: {} },
        {
          provide: LocationService,
          useValue: businessLifecycle,
        },
        { provide: ServiceCatalogFacade, useValue: serviceCatalog },
        { provide: StaffEarningsService, useValue: earnings },
        { provide: OrdersFacade, useValue: orders },
        { provide: EventEmitter2, useValue: emitter },
      ],
    }).compile();
    service = module.get(BookingsFacade);
  });

  it('marks elapsed open bookings completed and records payroll', async () => {
    const row = booking();
    db.booking.findMany.mockResolvedValue([row]);
    db.booking.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.completeElapsed(new Date('2026-09-24T12:00:00.000Z')),
    ).resolves.toBe(1);
    expect(earnings.recordForCompletedBooking).toHaveBeenCalledWith(
      {
        ...row,
        status: BookingStatus.COMPLETED,
      },
      db,
      order,
    );
    expect(earnings.syncForCompletedBooking).toHaveBeenCalledWith(
      {
        ...row,
        status: BookingStatus.COMPLETED,
      },
      expect.objectContaining({ name: 'System' }),
      db,
      order,
    );
    expect(emitter.emit).toHaveBeenCalled();
  });

  it('does not overwrite a status the staff already changed', async () => {
    db.booking.findMany.mockResolvedValue([
      booking({ status: BookingStatus.CONFIRMED }),
    ]);
    db.booking.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.completeElapsed(new Date('2026-09-24T12:00:00.000Z')),
    ).resolves.toBe(0);
    expect(earnings.recordForCompletedBooking).not.toHaveBeenCalled();
    expect(earnings.syncForCompletedBooking).not.toHaveBeenCalled();
  });

  it('leaves pre-restoration bookings for manual decisions without orders or payroll', async () => {
    db.booking.findMany.mockResolvedValue([booking()]);
    businessLifecycle.getAutomaticProcessingCutoffs.mockResolvedValue(
      new Map([['biz', new Date('2026-09-25T00:00:00Z')]]),
    );
    await expect(
      service.completeElapsed(new Date('2026-09-26T00:00:00Z')),
    ).resolves.toBe(0);
    expect(db.booking.updateMany).not.toHaveBeenCalled();
    expect(orders.syncCompletedBooking).not.toHaveBeenCalled();
    expect(earnings.recordForCompletedBooking).not.toHaveBeenCalled();
  });

  it('skips a location deleted after selecting due bookings', async () => {
    db.booking.findMany.mockResolvedValue([booking()]);
    businessLifecycle.acquireActiveOperationLock.mockResolvedValue(false);
    await expect(service.completeElapsed()).resolves.toBe(0);
    expect(db.booking.updateMany).not.toHaveBeenCalled();
    expect(orders.syncCompletedBooking).not.toHaveBeenCalled();
  });
});

describe('BookingsFacade.updateStatus transactionality', () => {
  const token = authorizeTestToken({
    sub: 'user-1',
    role: UserRole.ADMIN,
    brandMemberships: [],
    locationMemberships: [],
    tokenEpoch: 0,
  } as TokenPayloadDto);
  const committed = { orderChanged: false };
  const db = {
    booking: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  const order = { id: 'order-1', items: [] };
  const orders = {
    syncCompletedBooking: vi.fn(),
  };
  const earnings = {
    recordForCompletedBooking: vi.fn(),
    syncForCompletedBooking: vi.fn(),
  };
  let service: BookingsFacade;

  beforeEach(async () => {
    vi.clearAllMocks();
    committed.orderChanged = false;
    db.booking.findFirst.mockResolvedValue(
      booking({ status: BookingStatus.CONFIRMED }),
    );
    db.$transaction.mockImplementation(async (callback) => {
      const tx = {
        booking: {
          update: vi
            .fn()
            .mockResolvedValue(booking({ status: BookingStatus.COMPLETED })),
        },
        orderChanged: committed.orderChanged,
      };
      const result = await callback(tx);
      committed.orderChanged = tx.orderChanged;
      return result;
    });
    orders.syncCompletedBooking.mockImplementation(
      async (_booking, _actor, tx) => {
        tx.orderChanged = true;
        return order;
      },
    );
    earnings.recordForCompletedBooking.mockResolvedValue([]);
    earnings.syncForCompletedBooking.mockRejectedValue(
      new Error('payroll period locked'),
    );

    const module = await Test.createTestingModule({
      providers: [
        BookingsFacade,
        BookingMutationService,
        { provide: BookingClientTokenService, useValue: {} },
        BookingRescheduleService,
        BookingLifecycleService,
        BookingWriteLockService,
        BookingEventsService,
        BookingSlotLockService,
        BookingReadService,
        BookingSetupService,
        { provide: ProductsService, useValue: products },
        { provide: DatabaseService, useValue: db },
        { provide: CalendarFacade, useValue: { deleteBookingEvents: vi.fn() } },
        { provide: StaffService, useValue: {} },
        { provide: LocationService, useValue: {} },
        { provide: ServiceCatalogFacade, useValue: serviceCatalog },
        { provide: StaffEarningsService, useValue: earnings },
        { provide: OrdersFacade, useValue: orders },
        { provide: EventEmitter2, useValue: { emit: vi.fn() } },
      ],
    }).compile();
    service = module.get(BookingsFacade);
  });

  it('rolls back order sync when payroll sync rejects', async () => {
    await expect(
      service.updateStatus(
        await service.findByIdInLocation('biz', 'booking-1'),
        auditActorFromToken(token, 'biz'),
        {
          status: BookingStatus.COMPLETED,
        },
      ),
    ).rejects.toThrow('payroll period locked');

    expect(orders.syncCompletedBooking).toHaveBeenCalled();
    expect(earnings.syncForCompletedBooking).toHaveBeenCalled();
    expect(committed.orderChanged).toBe(false);
  });
});

describe('BookingsFacade.search', () => {
  const findMany = vi.fn();
  const count = vi.fn();
  const queryRaw = vi.fn();
  const db = {
    booking: { findMany, count },
    $queryRaw: queryRaw,
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
  };

  let service: BookingsFacade;

  beforeEach(async () => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);
    const module = await Test.createTestingModule({
      providers: [
        BookingsFacade,
        BookingMutationService,
        { provide: BookingClientTokenService, useValue: {} },
        BookingRescheduleService,
        BookingLifecycleService,
        BookingWriteLockService,
        BookingEventsService,
        BookingSlotLockService,
        BookingReadService,
        BookingSetupService,
        { provide: ProductsService, useValue: products },
        { provide: DatabaseService, useValue: db },
        { provide: CalendarFacade, useValue: { deleteBookingEvents: vi.fn() } },
        { provide: StaffService, useValue: {} },
        { provide: LocationService, useValue: {} },
        { provide: ServiceCatalogFacade, useValue: serviceCatalog },
        { provide: StaffEarningsService, useValue: {} },
        { provide: OrdersFacade, useValue: {} },
        { provide: EventEmitter2, useValue: { emit: vi.fn() } },
      ],
    }).compile();
    service = module.get(BookingsFacade);
  });

  it('filters by creation date and every text field', async () => {
    await service.search('biz', {
      locationId: 'biz',
      page: 1,
      pageSize: 25,
      search: '  стрижка  ',
      staffIds: ['anna', 'boris'],
      catalogItemIds: ['haircut'],
      createdFrom: '2026-09-01T00:00:00.000Z',
      createdTo: '2026-09-30T23:59:59.000Z',
    } as BookingSearchRequestDto);

    expect(findMany.mock.calls[0][0].where).toEqual({
      location: { deletedAt: null, brand: { deletedAt: null } },
      locationId: 'biz',
      deletedAt: null,
      AND: [
        {
          OR: [
            {
              bundleId: null,
              items: {
                some: {
                  staffId: { in: ['anna', 'boris'] },
                  serviceId: { in: ['haircut'] },
                },
              },
            },
            {
              bundleId: { in: ['haircut'] },
              items: { some: { staffId: { in: ['anna', 'boris'] } } },
            },
          ],
        },
      ],
      createdAt: {
        gte: new Date('2026-09-01T00:00:00.000Z'),
        lte: new Date('2026-09-30T23:59:59.000Z'),
      },
      OR: [
        { clientFirstName: { contains: 'стрижка', mode: 'insensitive' } },
        { clientLastName: { contains: 'стрижка', mode: 'insensitive' } },
        { clientPhone: { contains: 'стрижка' } },
        { clientEmail: { contains: 'стрижка', mode: 'insensitive' } },
        {
          items: {
            some: {
              serviceTitle: { contains: 'стрижка', mode: 'insensitive' },
            },
          },
        },
        {
          items: {
            some: { staffName: { contains: 'стрижка', mode: 'insensitive' } },
          },
        },
        { notes: { contains: 'стрижка', mode: 'insensitive' } },
        { internalNotes: { contains: 'стрижка', mode: 'insensitive' } },
        { cancellationReason: { contains: 'стрижка', mode: 'insensitive' } },
      ],
    });
  });

  it('matches a client or staff full name in any word order', async () => {
    await service.search('biz', {
      locationId: 'biz',
      page: 1,
      pageSize: 25,
      search: '  Андреева   Яна  ',
    } as BookingSearchRequestDto);

    const or = findMany.mock.calls[0][0].where.OR;
    expect(or.at(-2)).toEqual({
      AND: [
        {
          OR: [
            { clientFirstName: { contains: 'Андреева', mode: 'insensitive' } },
            { clientLastName: { contains: 'Андреева', mode: 'insensitive' } },
          ],
        },
        {
          OR: [
            { clientFirstName: { contains: 'Яна', mode: 'insensitive' } },
            { clientLastName: { contains: 'Яна', mode: 'insensitive' } },
          ],
        },
      ],
    });
    expect(or.at(-1)).toEqual({
      items: {
        some: {
          AND: [
            { staffName: { contains: 'Андреева', mode: 'insensitive' } },
            { staffName: { contains: 'Яна', mode: 'insensitive' } },
          ],
        },
      },
    });
  });

  it('does not filter by staff or service when the id lists are empty', async () => {
    await service.search('biz', {
      locationId: 'biz',
      page: 1,
      pageSize: 25,
      staffIds: [],
      catalogItemIds: [],
    } as BookingSearchRequestDto);

    expect(findMany.mock.calls[0][0].where).toEqual({
      location: { deletedAt: null, brand: { deletedAt: null } },
      locationId: 'biz',
      deletedAt: null,
    });
  });

  it.each([
    [
      BookingSearchOrderBy.START_AT,
      [{ startAt: OrderDirection.ASC }, { id: OrderDirection.ASC }],
    ],
    [
      BookingSearchOrderBy.CREATED_AT,
      [{ createdAt: OrderDirection.ASC }, { id: OrderDirection.ASC }],
    ],
    [
      BookingSearchOrderBy.SERVICE_TITLE,
      [{ startAt: OrderDirection.ASC }, { id: OrderDirection.ASC }],
    ],
    [
      BookingSearchOrderBy.STAFF_NAME,
      [{ startAt: OrderDirection.ASC }, { id: OrderDirection.ASC }],
    ],
    [
      BookingSearchOrderBy.STATUS,
      [{ status: OrderDirection.ASC }, { id: OrderDirection.ASC }],
    ],
    [
      BookingSearchOrderBy.SOURCE,
      [{ source: OrderDirection.ASC }, { id: OrderDirection.ASC }],
    ],
  ])('orders by %s', async (orderBy, expected) => {
    await service.search('biz', {
      locationId: 'biz',
      page: 1,
      pageSize: 25,
      orderBy,
      orderDirection: OrderDirection.ASC,
    } as BookingSearchRequestDto);

    expect(findMany.mock.calls[0][0].orderBy).toEqual(expected);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('orders client name by last name, then first name', async () => {
    await service.search('biz', {
      locationId: 'biz',
      page: 1,
      pageSize: 25,
      orderBy: BookingSearchOrderBy.CLIENT_NAME,
      orderDirection: OrderDirection.DESC,
    } as BookingSearchRequestDto);

    expect(findMany.mock.calls[0][0].orderBy).toEqual([
      { clientLastName: OrderDirection.DESC },
      { clientFirstName: OrderDirection.DESC },
      { id: OrderDirection.DESC },
    ]);
  });

  it('orders price by numeric coalesce of custom and service price', async () => {
    findMany.mockResolvedValue([
      booking({ id: 'low', item: { chargedPrice: new Prisma.Decimal('10') } }),
      booking({
        id: 'high',
        item: { chargedPrice: new Prisma.Decimal('100') },
      }),
    ]);
    count.mockResolvedValue(2);

    const result = await service.search('biz', {
      locationId: 'biz',
      page: 1,
      pageSize: 10,
      search: '10%',
      orderBy: BookingSearchOrderBy.PRICE,
      orderDirection: OrderDirection.ASC,
    } as BookingSearchRequestDto);

    expect(queryRaw).not.toHaveBeenCalled();
    expect(result.items.map((item) => item.id)).toEqual(['low', 'high']);
    expect(result.totalItems).toBe(2);
    expect(findMany.mock.calls[0][0].where.OR).toBeDefined();
  });
});

describe('BookingCalendarReadService.listForCalendar', () => {
  const findMany = vi.fn();
  const db = { bookingItem: { findMany } };

  let service: BookingCalendarReadService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        BookingCalendarReadService,
        { provide: DatabaseService, useValue: db },
      ],
    }).compile();
    service = module.get(BookingCalendarReadService);
  });

  it('returns visible visits and every linked block id, including cancelled', async () => {
    const rangeStart = new Date('2026-09-21T00:00:00.000Z');
    const rangeEnd = new Date('2026-09-28T00:00:00.000Z');
    findMany.mockResolvedValue(
      [
        booking({
          id: 'visible',
          item: {
            calendarEventId: 'ev-1',
            customPrice: new Prisma.Decimal('10.00'),
          },
        }),
        booking({
          id: 'cancelled',
          status: BookingStatus.CANCELLED,
          item: { calendarEventId: 'ev-2' },
        }),
        booking({
          id: 'noshow',
          status: BookingStatus.NO_SHOW,
          item: { calendarEventId: null },
        }),
      ].map((row) => ({
        ...row.items[0],
        booking: {
          id: row.id,
          clientFirstName: row.clientFirstName,
          clientLastName: row.clientLastName,
          status: row.status,
        },
      })),
    );

    const feed = await service.listForCalendar('biz', rangeStart, rangeEnd, [
      'anna',
    ]);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        location: { deletedAt: null, brand: { deletedAt: null } },
        locationId: 'biz',
        startAt: { lt: rangeEnd },
        endAt: { gt: rangeStart },
        staffId: { in: ['anna'] },
        booking: { deletedAt: null },
      },
      orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        staffId: true,
        staffName: true,
        serviceTitle: true,
        sortOrder: true,
        chargedPrice: true,
        customPrice: true,
        startAt: true,
        endAt: true,
        calendarEventId: true,
        booking: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });
    expect(feed.bookings.map((item) => item.id)).toEqual(['visible', 'noshow']);
    expect(feed.bookings[0].price).toBe('10.00');
    expect(feed.bookings[0].entityId).toBe('visible');
    expect(feed.linkedEventIds).toEqual(['ev-1', 'ev-2']);
  });

  it('draws one card per staff stretch and sums its services', async () => {
    const rangeStart = new Date('2026-09-21T00:00:00.000Z');
    const rangeEnd = new Date('2026-09-28T00:00:00.000Z');
    const item = (
      id: string,
      staffId: string,
      serviceTitle: string,
      sortOrder: number,
      startAt: string,
      endAt: string,
      price: string,
    ) => ({
      id,
      staffId,
      staffName: staffId,
      serviceTitle,
      sortOrder,
      chargedPrice: new Prisma.Decimal(price),
      customPrice: null,
      startAt: new Date(startAt),
      endAt: new Date(endAt),
      calendarEventId: null,
      booking: { id: 'booking-1', status: BookingStatus.CONFIRMED },
    });
    findMany.mockResolvedValue([
      item(
        'cut',
        'anna',
        'Стрижка',
        0,
        '2026-09-22T07:00:00.000Z',
        '2026-09-22T08:00:00.000Z',
        '50.00',
      ),
      item(
        'color',
        'anna',
        'Окрашивание',
        1,
        '2026-09-22T08:00:00.000Z',
        '2026-09-22T09:00:00.000Z',
        '70.00',
      ),
      item(
        'style',
        'anna',
        'Укладка',
        2,
        '2026-09-22T09:00:00.000Z',
        '2026-09-22T09:30:00.000Z',
        '30.00',
      ),
      item(
        'brows',
        'ira',
        'Брови',
        3,
        '2026-09-22T07:00:00.000Z',
        '2026-09-22T07:30:00.000Z',
        '20.00',
      ),
    ]);

    const feed = await service.listForCalendar('biz', rangeStart, rangeEnd);

    expect(feed.bookings).toEqual([
      {
        id: 'booking-1:anna',
        entityId: 'booking-1',
        staffId: 'anna',
        staffName: 'anna',
        serviceTitles: ['Стрижка', 'Окрашивание', 'Укладка'],
        price: '150.00',
        startAt: new Date('2026-09-22T07:00:00.000Z'),
        endAt: new Date('2026-09-22T09:30:00.000Z'),
      },
      {
        id: 'booking-1:ira',
        entityId: 'booking-1',
        staffId: 'ira',
        staffName: 'ira',
        serviceTitles: ['Брови'],
        price: '20.00',
        startAt: new Date('2026-09-22T07:00:00.000Z'),
        endAt: new Date('2026-09-22T07:30:00.000Z'),
      },
    ]);
  });
});

describe('BookingsFacade catalog selection', () => {
  const serviceCategoryFindMany = vi.fn();
  const serviceFindMany = vi.fn();
  const bundleFindMany = vi.fn();
  const staff = {
    listActiveWithServices: vi.fn(),
    servicesPerformableBy: vi.fn(),
    findById: vi.fn(),
    resolveStaffingForServices: vi.fn(),
  };
  const db = {
    serviceCategory: { findMany: serviceCategoryFindMany },
    service: { findMany: serviceFindMany },
    serviceBundle: { findMany: bundleFindMany },
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
  };

  let service: BookingsFacade;

  beforeEach(async () => {
    vi.clearAllMocks();
    serviceCatalog.loadForBooking.mockImplementation(async () => ({
      categories: await serviceCategoryFindMany(),
      services: await serviceFindMany(),
      bundles: await bundleFindMany(),
    }));
    const module = await Test.createTestingModule({
      providers: [
        BookingsFacade,
        BookingMutationService,
        { provide: BookingClientTokenService, useValue: {} },
        BookingRescheduleService,
        BookingLifecycleService,
        BookingWriteLockService,
        BookingEventsService,
        BookingSlotLockService,
        BookingReadService,
        BookingSetupService,
        { provide: ProductsService, useValue: products },
        { provide: DatabaseService, useValue: db },
        { provide: CalendarFacade, useValue: { deleteBookingEvents: vi.fn() } },
        { provide: StaffService, useValue: staff },
        { provide: LocationService, useValue: {} },
        { provide: ServiceCatalogFacade, useValue: serviceCatalog },
        { provide: StaffEarningsService, useValue: {} },
        { provide: OrdersFacade, useValue: {} },
        { provide: EventEmitter2, useValue: { emit: vi.fn() } },
      ],
    }).compile();
    service = module.get(BookingsFacade);
  });

  it('places services and bundles in one category list ordered by sort order', async () => {
    serviceCategoryFindMany.mockResolvedValue([
      {
        id: 'cat',
        name: 'Волосы',
        description: null,
        services: [
          {
            id: 'cut',
            categoryId: 'cat',
            title: 'Стрижка',
            description: null,
            price: new Prisma.Decimal('20.00'),
            durationMinutes: 30,
            sortOrder: 2,
            imageFile: null,
          },
        ],
        bundles: [
          {
            id: 'pack',
            categoryId: 'cat',
            title: 'Комплекс',
            description: null,
            sortOrder: 1,
            executionMode: BookingExecutionMode.SEQUENTIAL,
            fixedPrice: new Prisma.Decimal('30.00'),
            imageFile: null,
            items: [
              {
                serviceId: 'cut',
                service: {
                  price: new Prisma.Decimal('20.00'),
                  durationMinutes: 30,
                  bufferMinutes: 0,
                },
              },
            ],
          },
        ],
      },
    ]);
    serviceFindMany.mockResolvedValue([
      {
        id: 'lone',
        categoryId: null,
        title: 'Без',
        description: null,
        price: new Prisma.Decimal('10.00'),
        durationMinutes: 15,
        sortOrder: 0,
        imageFile: null,
      },
    ]);
    bundleFindMany.mockResolvedValue([
      {
        id: 'loose',
        categoryId: null,
        title: 'Пакет',
        description: null,
        sortOrder: 0,
        executionMode: BookingExecutionMode.SEQUENTIAL,
        fixedPrice: null,
        imageFile: null,
        items: [
          {
            serviceId: 'lone',
            service: {
              price: new Prisma.Decimal('10.00'),
              durationMinutes: 15,
              bufferMinutes: 0,
            },
          },
        ],
      },
    ]);
    staff.listActiveWithServices.mockResolvedValue([]);

    const setup = BookingSetupResponseDto.fromEntity(
      await service.getBookingSetup('biz'),
    );

    expect(products.listForPublicCatalog).toHaveBeenCalledWith('biz');
    expect(setup.products).toEqual({ categories: [], items: [] });
    expect(setup).not.toHaveProperty('bundles');
    expect(
      setup.categories[0].services.map((item) => [item.id, item.kind]),
    ).toEqual([
      ['pack', ServiceCatalogKind.BUNDLE],
      ['cut', ServiceCatalogKind.SERVICE],
    ]);
    expect(setup.categories[1].id).toBeNull();
    expect(setup.categories[1].services.map((item) => item.id)).toEqual([
      'lone',
      'loose',
    ]);
  });

  it('offers every active service and bundle before a staff member is chosen', async () => {
    serviceFindMany.mockResolvedValue([
      {
        id: 'cut',
        price: new Prisma.Decimal('10'),
        durationMinutes: 30,
        bufferMinutes: 0,
      },
      {
        id: 'color',
        price: new Prisma.Decimal('20'),
        durationMinutes: 60,
        bufferMinutes: 0,
      },
    ]);
    bundleFindMany.mockResolvedValue([{ id: 'pack', items: [] }]);
    staff.listActiveWithServices.mockResolvedValue([]);

    const resolved = await service.resolveBookingSelection(
      'biz',
      {} as BookingResolveRequestDto,
    );

    expect(resolved.availableServiceIds).toEqual(['cut', 'color', 'pack']);
  });

  it('offers a bundle to a staff member only when they can perform every service in it', async () => {
    serviceFindMany.mockResolvedValue([
      {
        id: 'cut',
        price: new Prisma.Decimal('10'),
        durationMinutes: 30,
        bufferMinutes: 0,
      },
      {
        id: 'color',
        price: new Prisma.Decimal('20'),
        durationMinutes: 60,
        bufferMinutes: 0,
      },
    ]);
    bundleFindMany.mockResolvedValue([
      { id: 'pack', items: [{ serviceId: 'cut' }] },
      { id: 'wedding', items: [{ serviceId: 'cut' }, { serviceId: 'color' }] },
    ]);
    staff.servicesPerformableBy.mockResolvedValue(['cut']);
    staff.findById.mockResolvedValue({ name: 'Anna' });

    const resolved = await service.resolveBookingSelection('biz', {
      staffId: 'anna',
    } as BookingResolveRequestDto);

    expect(resolved.availableServiceIds).toEqual(['cut', 'pack']);
    expect(resolved.totalListPrice).toBe('0.00');
    expect(resolved.totalDuration).toBe(0);
  });

  it('keeps the visit price when a master is already chosen', async () => {
    serviceFindMany.mockResolvedValue([
      {
        id: 'cut',
        price: new Prisma.Decimal('10'),
        durationMinutes: 30,
        bufferMinutes: 5,
      },
      {
        id: 'color',
        price: new Prisma.Decimal('20.50'),
        durationMinutes: 60,
        bufferMinutes: 0,
      },
    ]);
    bundleFindMany.mockResolvedValue([]);
    staff.servicesPerformableBy.mockResolvedValue(['cut', 'color']);
    staff.resolveStaffingForServices.mockResolvedValue({
      coverableBySingle: [{ id: 'anna', name: 'Anna' }],
      requiresMultiple: false,
    });

    const resolved = await service.resolveBookingSelection('biz', {
      staffId: 'anna',
      serviceIds: ['cut', 'color'],
    } as BookingResolveRequestDto);

    expect(resolved.totalListPrice).toBe('30.50');
    expect(resolved.totalDuration).toBe(95);
    expect(resolved.availableServiceIds).toEqual(['cut', 'color']);
  });
});

describe('BookingsFacade.update item prices', () => {
  const findFirst = vi.fn();
  const update = vi.fn();
  const db = {
    booking: { findFirst, update },
    $transaction: vi.fn((callback) =>
      callback({ booking: { findFirst, update } }),
    ),
  };
  const token = authorizeTestToken({
    sub: 'user-1',
    role: UserRole.ADMIN,
    brandMemberships: [],
    locationMemberships: [],
    tokenEpoch: 0,
  } as TokenPayloadDto);
  let service: BookingsFacade;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        BookingsFacade,
        BookingMutationService,
        { provide: BookingClientTokenService, useValue: {} },
        BookingRescheduleService,
        BookingLifecycleService,
        BookingWriteLockService,
        BookingEventsService,
        BookingSlotLockService,
        BookingReadService,
        BookingSetupService,
        { provide: ProductsService, useValue: products },
        { provide: DatabaseService, useValue: db },
        { provide: CalendarFacade, useValue: { deleteBookingEvents: vi.fn() } },
        { provide: StaffService, useValue: {} },
        {
          provide: LocationService,
          useValue: {
            getLocale: vi.fn().mockResolvedValue({ currency: 'BYN' }),
          },
        },
        { provide: ServiceCatalogFacade, useValue: serviceCatalog },
        { provide: StaffEarningsService, useValue: {} },
        {
          provide: OrdersFacade,
          useValue: {
            syncCompletedBooking: vi.fn(),
          },
        },
        { provide: EventEmitter2, useValue: { emit: vi.fn() } },
      ],
    }).compile();
    service = module.get(BookingsFacade);
  });

  function visit(): BookingWithItems {
    return booking({
      items: [
        {
          id: 'item-1',
          bookingId: 'booking-1',
          locationId: 'biz',
          serviceId: 'cut',
          staffId: 'anna',
          sortOrder: 0,
          startAt: new Date('2026-09-24T10:00:00.000Z'),
          endAt: new Date('2026-09-24T11:00:00.000Z'),
          serviceTitle: 'Стрижка',
          serviceDuration: 60,
          listPrice: new Prisma.Decimal('50.00'),
          chargedPrice: new Prisma.Decimal('50.00'),
          customPrice: null,
          staffName: 'Anna',
          calendarEventId: null,
        },
        {
          id: 'item-2',
          bookingId: 'booking-1',
          locationId: 'biz',
          serviceId: 'color',
          staffId: 'anna',
          sortOrder: 1,
          startAt: new Date('2026-09-24T11:00:00.000Z'),
          endAt: new Date('2026-09-24T12:00:00.000Z'),
          serviceTitle: 'Окрашивание',
          serviceDuration: 60,
          listPrice: new Prisma.Decimal('80.00'),
          chargedPrice: new Prisma.Decimal('80.00'),
          customPrice: new Prisma.Decimal('70.00'),
          staffName: 'Anna',
          calendarEventId: null,
        },
      ],
    });
  }

  it('writes a custom price onto each listed item and leaves the rest', async () => {
    const current = visit();
    findFirst.mockResolvedValue(current);
    update.mockResolvedValue(current);

    await service.update(
      await service.findByIdInLocation('biz', 'booking-1'),
      auditActorFromToken(token, 'biz'),
      {
        items: [{ id: 'item-2', customPrice: '60.00' }],
      },
    );

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          items: {
            update: [
              { where: { id: 'item-2' }, data: { customPrice: '60.00' } },
            ],
          },
        }),
      }),
    );
  });

  it('does not touch item prices when the request omits them', async () => {
    findFirst.mockResolvedValue(visit());
    update.mockResolvedValue(visit());

    await service.update(
      await service.findByIdInLocation('biz', 'booking-1'),
      auditActorFromToken(token, 'biz'),
      { notes: 'окно' },
    );

    expect(update.mock.calls[0][0].data.items).toBeUndefined();
  });

  it('rejects a price for an item that is not on this booking', async () => {
    findFirst.mockResolvedValue(visit());

    const error = await service
      .update(
        await service.findByIdInLocation('biz', 'booking-1'),
        auditActorFromToken(token, 'biz'),
        {
          items: [{ id: 'missing', customPrice: '10.00' }],
        },
      )
      .then(
        () => null,
        (caught: unknown) => caught,
      );

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).errorCode).toBe('BOOKING_ITEM_NOT_FOUND');
    expect(update).not.toHaveBeenCalled();
  });
});

describe('BookingsFacade.update manual interval', () => {
  const findFirst = vi.fn();
  const bookingUpdate = vi.fn();
  const bookingItemUpdate = vi.fn();
  const db = {
    booking: { findFirst, update: bookingUpdate },
    bookingItem: { update: bookingItemUpdate },
    $executeRaw: vi.fn(),
    $transaction: vi.fn((callback) => callback(db)),
  };
  const calendar = {
    saveBookingEvent: vi.fn(),
    isSlotFree: vi.fn(),
    listBlockingEvents: vi.fn(),
  };
  const token = authorizeTestToken({
    sub: 'user-1',
    role: UserRole.ADMIN,
    brandMemberships: [],
    locationMemberships: [],
    tokenEpoch: 0,
  } as TokenPayloadDto);
  let service: BookingsFacade;

  beforeEach(async () => {
    vi.clearAllMocks();
    calendar.saveBookingEvent.mockResolvedValue({ id: 'event-1' });
    const module = await Test.createTestingModule({
      providers: [
        BookingsFacade,
        BookingMutationService,
        { provide: BookingClientTokenService, useValue: {} },
        BookingRescheduleService,
        BookingLifecycleService,
        BookingWriteLockService,
        BookingEventsService,
        BookingSlotLockService,
        BookingReadService,
        BookingSetupService,
        { provide: ProductsService, useValue: products },
        { provide: DatabaseService, useValue: db },
        { provide: CalendarFacade, useValue: calendar },
        { provide: StaffService, useValue: {} },
        {
          provide: LocationService,
          useValue: {
            findById: vi.fn().mockResolvedValue({ timezone: 'UTC' }),
          },
        },
        { provide: ServiceCatalogFacade, useValue: serviceCatalog },
        { provide: StaffEarningsService, useValue: {} },
        {
          provide: OrdersFacade,
          useValue: {
            syncCompletedBooking: vi.fn(),
          },
        },
        { provide: EventEmitter2, useValue: { emit: vi.fn() } },
      ],
    }).compile();
    service = module.get(BookingsFacade);
  });

  function twoItemVisit(overrides: Partial<BookingWithItems> = {}) {
    return booking({
      source: BookingSource.WALK_IN,
      startAt: new Date('2026-09-24T10:00:00.000Z'),
      endAt: new Date('2026-09-24T12:00:00.000Z'),
      items: [
        {
          id: 'item-1',
          bookingId: 'booking-1',
          locationId: 'biz',
          serviceId: 'cut',
          staffId: 'anna',
          sortOrder: 0,
          startAt: new Date('2026-09-24T10:00:00.000Z'),
          endAt: new Date('2026-09-24T11:00:00.000Z'),
          serviceTitle: 'Cut',
          serviceDuration: 60,
          listPrice: new Prisma.Decimal('50.00'),
          chargedPrice: new Prisma.Decimal('50.00'),
          customPrice: null,
          staffName: 'Anna',
          calendarEventId: 'event-1',
        },
        {
          id: 'item-2',
          bookingId: 'booking-1',
          locationId: 'biz',
          serviceId: 'color',
          staffId: 'anna',
          sortOrder: 1,
          startAt: new Date('2026-09-24T11:00:00.000Z'),
          endAt: new Date('2026-09-24T12:00:00.000Z'),
          serviceTitle: 'Color',
          serviceDuration: 60,
          listPrice: new Prisma.Decimal('80.00'),
          chargedPrice: new Prisma.Decimal('80.00'),
          customPrice: null,
          staffName: 'Anna',
          calendarEventId: 'event-2',
        },
      ],
      ...overrides,
    });
  }

  it('updates start and end as a manual interval without checking slot availability', async () => {
    const current = twoItemVisit();
    const updated = twoItemVisit({
      startAt: new Date('2026-09-24T10:15:00.000Z'),
      endAt: new Date('2026-09-24T12:45:00.000Z'),
      items: [
        {
          ...current.items[0],
          startAt: new Date('2026-09-24T10:15:00.000Z'),
          endAt: new Date('2026-09-24T11:30:00.000Z'),
        },
        {
          ...current.items[1],
          startAt: new Date('2026-09-24T11:30:00.000Z'),
          endAt: new Date('2026-09-24T12:45:00.000Z'),
        },
      ],
    });
    findFirst.mockResolvedValue(current);
    bookingUpdate.mockResolvedValue(updated);

    await service.update(
      await service.findByIdInLocation('biz', 'booking-1'),
      auditActorFromToken(token, 'biz'),
      {
        startAt: '2026-09-24T10:15:00',
        endAt: '2026-09-24T12:45:00',
      },
    );

    expect(calendar.isSlotFree).not.toHaveBeenCalled();
    expect(calendar.listBlockingEvents).not.toHaveBeenCalled();
    expect(bookingItemUpdate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: 'item-1' },
        data: expect.objectContaining({
          startAt: new Date('2026-09-24T10:15:00.000Z'),
          endAt: new Date('2026-09-24T11:30:00.000Z'),
        }),
      }),
    );
    expect(bookingItemUpdate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: 'item-2' },
        data: expect.objectContaining({
          startAt: new Date('2026-09-24T11:30:00.000Z'),
          endAt: new Date('2026-09-24T12:45:00.000Z'),
        }),
      }),
    );
    expect(bookingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          startAt: new Date('2026-09-24T10:15:00.000Z'),
          endAt: new Date('2026-09-24T12:45:00.000Z'),
        }),
      }),
    );
  });

  it('rejects manual intervals whose end is not after start', async () => {
    findFirst.mockResolvedValue(twoItemVisit());

    const error = await service
      .update(
        await service.findByIdInLocation('biz', 'booking-1'),
        auditActorFromToken(token, 'biz'),
        {
          startAt: '2026-09-24T10:00:00',
          endAt: '2026-09-24T10:00:00',
        },
      )
      .then(
        () => null,
        (caught: unknown) => caught,
      );

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).errorCode).toBe('BOOKING_INVALID_INTERVAL');
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('allows saving the same past off-grid walk-in interval again', async () => {
    const current = twoItemVisit({
      startAt: new Date('2026-09-20T10:07:00.000Z'),
      endAt: new Date('2026-09-20T10:53:00.000Z'),
      items: [
        {
          ...twoItemVisit().items[0],
          startAt: new Date('2026-09-20T10:07:00.000Z'),
          endAt: new Date('2026-09-20T10:30:00.000Z'),
        },
        {
          ...twoItemVisit().items[1],
          startAt: new Date('2026-09-20T10:30:00.000Z'),
          endAt: new Date('2026-09-20T10:53:00.000Z'),
        },
      ],
    });
    findFirst.mockResolvedValue(current);
    bookingUpdate.mockResolvedValue(current);

    await expect(
      service.update(
        await service.findByIdInLocation('biz', 'booking-1'),
        auditActorFromToken(token, 'biz'),
        {
          startAt: '2026-09-20T10:07:00',
          endAt: '2026-09-20T10:53:00',
        },
      ),
    ).resolves.toBe(current);

    expect(calendar.isSlotFree).not.toHaveBeenCalled();
    expect(bookingUpdate).toHaveBeenCalled();
  });
});

describe('BookingsFacade.addProduct', () => {
  const bookingRow = booking();
  const db = {
    booking: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn((callback) => callback(db)),
  };
  const token = authorizeTestToken({
    sub: 'user-1',
    role: UserRole.ADMIN,
    brandMemberships: [],
    locationMemberships: [],
    tokenEpoch: 0,
  } as TokenPayloadDto);
  const orders = {
    addDraftProductToBookingOrder: vi.fn().mockResolvedValue({
      id: 'order-1',
      items: [],
    }),
    addDraftProductsToBookingOrder: vi.fn().mockResolvedValue({
      id: 'order-1',
      items: [],
    }),
  };
  let service: BookingsFacade;

  beforeEach(async () => {
    vi.clearAllMocks();
    db.booking.findFirst.mockResolvedValue(bookingRow);
    const module = await Test.createTestingModule({
      providers: [
        BookingsFacade,
        BookingMutationService,
        { provide: BookingClientTokenService, useValue: {} },
        BookingRescheduleService,
        BookingLifecycleService,
        BookingWriteLockService,
        BookingEventsService,
        BookingSlotLockService,
        BookingReadService,
        BookingSetupService,
        { provide: ProductsService, useValue: products },
        { provide: DatabaseService, useValue: db },
        { provide: CalendarFacade, useValue: { deleteBookingEvents: vi.fn() } },
        { provide: StaffService, useValue: {} },
        { provide: LocationService, useValue: {} },
        { provide: ServiceCatalogFacade, useValue: serviceCatalog },
        { provide: StaffEarningsService, useValue: {} },
        { provide: OrdersFacade, useValue: orders },
        { provide: EventEmitter2, useValue: { emit: vi.fn() } },
      ],
    }).compile();
    service = module.get(BookingsFacade);
  });

  it('adds a draft product to the booking order without changing booking status', async () => {
    const dto = { productId: 'product-1', quantity: '1.000' };

    await service.addProduct(
      'biz',
      'booking-1',
      auditActorFromToken(token, 'biz'),
      dto,
      true,
    );

    expect(orders.addDraftProductsToBookingOrder).toHaveBeenCalledWith(
      bookingRow,
      [dto],
      expect.objectContaining({ name: expect.any(String) }),
      db,
      true,
    );
  });
});

describe('BookingsFacade.cancel draft product cleanup', () => {
  const token = authorizeTestToken({
    sub: 'user-1',
    role: UserRole.ADMIN,
    brandMemberships: [],
    locationMemberships: [],
    tokenEpoch: 0,
  } as TokenPayloadDto);
  const sourceBooking = booking({ status: BookingStatus.CONFIRMED });
  const cancelledBooking = booking({ status: BookingStatus.CANCELLED });
  const removedDraftProductItems = [
    { orderItemId: 'draft-product-1', productId: 'product-1' },
  ];
  const db = {
    booking: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    location: {
      findUnique: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn((callback) => callback(db)),
  };
  const orders = {
    removeDraftProductsForBooking: vi
      .fn()
      .mockResolvedValue(removedDraftProductItems),
    reverseCompletedBookingServices: vi.fn(),
  };
  const earnings = {
    reverseForBooking: vi.fn(),
  };
  const emitter = { emit: vi.fn() };
  let service: BookingsFacade;

  beforeEach(async () => {
    vi.clearAllMocks();
    db.booking.findFirst.mockResolvedValue(sourceBooking);
    db.booking.update.mockResolvedValue(cancelledBooking);
    db.location.findUnique.mockResolvedValue({ brandId: 'brand-1' });
    orders.removeDraftProductsForBooking.mockResolvedValue(
      removedDraftProductItems,
    );
    const module = await Test.createTestingModule({
      providers: [
        BookingsFacade,
        BookingMutationService,
        { provide: BookingClientTokenService, useValue: {} },
        BookingRescheduleService,
        BookingLifecycleService,
        BookingWriteLockService,
        BookingEventsService,
        BookingSlotLockService,
        BookingReadService,
        BookingSetupService,
        { provide: ProductsService, useValue: products },
        { provide: DatabaseService, useValue: db },
        { provide: CalendarFacade, useValue: { deleteBookingEvents: vi.fn() } },
        { provide: StaffService, useValue: {} },
        { provide: LocationService, useValue: {} },
        { provide: ServiceCatalogFacade, useValue: serviceCatalog },
        { provide: StaffEarningsService, useValue: earnings },
        { provide: OrdersFacade, useValue: orders },
        { provide: EventEmitter2, useValue: emitter },
      ],
    }).compile();
    service = module.get(BookingsFacade);
  });

  it('removes draft product items when cancelling a non-completed booking', async () => {
    await service.cancel(
      await service.findByIdInLocation('biz', 'booking-1'),
      auditActorFromToken(token, 'biz'),
      CancelledBy.STAFF,
      {
        reason: 'client cancelled',
      },
    );

    expect(orders.removeDraftProductsForBooking).toHaveBeenCalledWith(
      cancelledBooking,
      db,
    );
    expect(orders.reverseCompletedBookingServices).not.toHaveBeenCalled();
    expect(earnings.reverseForBooking).not.toHaveBeenCalled();
    expect(emitter.emit).toHaveBeenCalledWith(
      'audit',
      expect.objectContaining({
        eventType: 'BOOKING_CANCELLED',
        payload: expect.objectContaining({ removedDraftProductItems }),
      }),
    );
  });
});

// These domain tests isolate row locking; BookingWriteLockService tests cover stale booking detection.
beforeEach(() => {
  vi.spyOn(
    BookingWriteLockService.prototype,
    'lockUnchangedBooking',
  ).mockResolvedValue(undefined);
});

function createMutationService(
  db: ConstructorParameters<typeof BookingMutationService>[0],
  calendar: ConstructorParameters<typeof BookingRescheduleService>[1],
  staff: ConstructorParameters<typeof BookingRescheduleService>[2],
  location: ConstructorParameters<typeof BookingRescheduleService>[3],
  earnings: ConstructorParameters<typeof BookingMutationService>[1],
  orders: ConstructorParameters<typeof BookingMutationService>[2],
  emitter: ConstructorParameters<typeof BookingEventsService>[0],
  read: ConstructorParameters<typeof BookingMutationService>[3],
): BookingMutationService {
  const write = new BookingWriteLockService(location);
  const events = new BookingEventsService(emitter, {} as never, location);
  const slots = new BookingSlotLockService(staff, calendar);
  const reschedule = new BookingRescheduleService(
    db,
    calendar,
    staff,
    location,
    orders,
    earnings,
    write,
    slots,
  );
  return new BookingMutationService(
    db,
    earnings,
    orders,
    read,
    write,
    events,
    new BookingLifecycleService(
      db,
      calendar,
      location,
      earnings,
      orders,
      read,
      write,
      events,
      reschedule,
    ),
    reschedule,
  );
}
