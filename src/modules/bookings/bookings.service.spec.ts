import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Booking, BookingSource, BookingStatus, Prisma } from '@prisma/client';
import { DatabaseService } from '../../database/database.service.js';
import { CalendarService } from '../calendar/calendar.service.js';
import { StaffService } from '../staff/staff.service.js';
import { BusinessService } from '../business/business.service.js';
import { StaffEarningsService } from '../payroll/earnings/staff-earnings.service.js';
import { BookingsService } from './bookings.service.js';
import { OrderDirection } from '../../shared/enums/order-direction.enum.js';
import { BookingSearchRequestDto } from './dto/booking-search-request.dto.js';
import { BookingSearchOrderBy } from './enums/booking-search-order-by.enum.js';
import { BookingWithItems } from './interfaces/booking-with-items.interface.js';

function booking(
  overrides: Partial<Booking> & Partial<BookingWithItems> = {},
): BookingWithItems {
  const startAt = overrides.startAt ?? new Date('2026-09-24T10:00:00.000Z');
  const endAt = overrides.endAt ?? new Date('2026-09-24T11:00:00.000Z');
  return {
    id: 'booking-1',
    businessId: 'biz',
    staffId: 'anna',
    serviceId: 'haircut',
    clientId: 'client',
    startAt,
    endAt,
    status: BookingStatus.CONFIRMED,
    source: BookingSource.MANUAL,
    clientFirstName: 'A',
    clientLastName: 'B',
    clientPhone: '+79000000000',
    clientEmail: null,
    serviceTitle: 'Стрижка',
    serviceDuration: 60,
    servicePrice: new Prisma.Decimal('50.00'),
    customPrice: null,
    staffName: 'Anna',
    calendarEventId: null,
    notes: null,
    internalNotes: null,
    cancellationReason: null,
    cancelledBy: null,
    cancelledAt: null,
    reminderSentAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
    bookingPageId: overrides.bookingPageId ?? null,
    bookingWidgetId: overrides.bookingWidgetId ?? null,
    items: overrides.items ?? [{
      id: `${overrides.id ?? 'booking-1'}-item-1`,
      bookingId: overrides.id ?? 'booking-1',
      businessId: overrides.businessId ?? 'biz',
      serviceId: overrides.serviceId ?? 'haircut',
      staffId: overrides.staffId ?? 'anna',
      sortOrder: 0,
      startAt,
      endAt,
      serviceTitle: overrides.serviceTitle ?? 'РЎС‚СЂРёР¶РєР°',
      serviceDuration: overrides.serviceDuration ?? 60,
      listPrice: overrides.servicePrice ?? new Prisma.Decimal('50.00'),
      chargedPrice: overrides.servicePrice ?? new Prisma.Decimal('50.00'),
      customPrice: overrides.customPrice ?? null,
      staffName: overrides.staffName ?? 'Anna',
      calendarEventId: overrides.calendarEventId ?? null,
    }],
  } as unknown as BookingWithItems;
}

describe('BookingsService.completeElapsed', () => {
  const db = {
    booking: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  const earnings = {
    recordForCompletedBooking: vi.fn(),
  };
  const emitter = { emit: vi.fn() };

  let service: BookingsService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        BookingsService,
        { provide: DatabaseService, useValue: db },
        { provide: CalendarService, useValue: {} },
        { provide: StaffService, useValue: {} },
        { provide: BusinessService, useValue: {} },
        { provide: StaffEarningsService, useValue: earnings },
        { provide: EventEmitter2, useValue: emitter },
      ],
    }).compile();
    service = module.get(BookingsService);
  });

  it('marks elapsed open bookings completed and records payroll', async () => {
    const row = booking();
    db.booking.findMany.mockResolvedValue([row]);
    db.booking.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.completeElapsed(new Date('2026-09-24T12:00:00.000Z'))).resolves.toBe(1);
    expect(earnings.recordForCompletedBooking).toHaveBeenCalledWith({
      ...row,
      status: BookingStatus.COMPLETED,
    });
    expect(emitter.emit).toHaveBeenCalled();
  });

  it('does not overwrite a status the staff already changed', async () => {
    db.booking.findMany.mockResolvedValue([booking({ status: BookingStatus.CONFIRMED })]);
    db.booking.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.completeElapsed(new Date('2026-09-24T12:00:00.000Z'))).resolves.toBe(0);
    expect(earnings.recordForCompletedBooking).not.toHaveBeenCalled();
  });
});

describe('BookingsService.search', () => {
  const findMany = vi.fn();
  const count = vi.fn();
  const queryRaw = vi.fn();
  const db = {
    booking: { findMany, count },
    $queryRaw: queryRaw,
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
  };

  let service: BookingsService;

  beforeEach(async () => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([]);
    count.mockResolvedValue(0);
    const module = await Test.createTestingModule({
      providers: [
        BookingsService,
        { provide: DatabaseService, useValue: db },
        { provide: CalendarService, useValue: {} },
        { provide: StaffService, useValue: {} },
        { provide: BusinessService, useValue: {} },
        { provide: StaffEarningsService, useValue: {} },
        { provide: EventEmitter2, useValue: { emit: vi.fn() } },
      ],
    }).compile();
    service = module.get(BookingsService);
  });

  it('filters by creation date and every text field', async () => {
    await service.search('biz', {
      businessId: 'biz',
      page: 1,
      pageSize: 25,
      search: '  стрижка  ',
      staffIds: ['anna', 'boris'],
      serviceIds: ['haircut'],
      createdFrom: '2026-09-01T00:00:00.000Z',
      createdTo: '2026-09-30T23:59:59.000Z',
    } as BookingSearchRequestDto);

    expect(findMany.mock.calls[0][0].where).toEqual({
      businessId: 'biz',
      deletedAt: null,
      items: {
        some: {
          staffId: { in: ['anna', 'boris'] },
          serviceId: { in: ['haircut'] },
        },
      },
      createdAt: {
        gte: new Date('2026-09-01T00:00:00.000Z'),
        lte: new Date('2026-09-30T23:59:59.000Z'),
      },
      OR: [
        { clientFirstName: { contains: 'стрижка', mode: 'insensitive' } },
        { clientLastName: { contains: 'стрижка', mode: 'insensitive' } },
        { clientPhone: { contains: 'стрижка' } },
        { clientEmail: { contains: 'стрижка', mode: 'insensitive' } },
        { items: { some: { serviceTitle: { contains: 'стрижка', mode: 'insensitive' } } } },
        { items: { some: { staffName: { contains: 'стрижка', mode: 'insensitive' } } } },
        { notes: { contains: 'стрижка', mode: 'insensitive' } },
        { internalNotes: { contains: 'стрижка', mode: 'insensitive' } },
        { cancellationReason: { contains: 'стрижка', mode: 'insensitive' } },
      ],
    });
  });

  it('does not filter by staff or service when the id lists are empty', async () => {
    await service.search('biz', {
      businessId: 'biz',
      page: 1,
      pageSize: 25,
      staffIds: [],
      serviceIds: [],
    } as BookingSearchRequestDto);

    expect(findMany.mock.calls[0][0].where).toEqual({
      businessId: 'biz',
      deletedAt: null,
    });
  });

  it.each([
    [BookingSearchOrderBy.START_AT, [{ startAt: OrderDirection.ASC }, { id: OrderDirection.ASC }]],
    [BookingSearchOrderBy.CREATED_AT, [{ createdAt: OrderDirection.ASC }, { id: OrderDirection.ASC }]],
    [BookingSearchOrderBy.SERVICE_TITLE, [{ startAt: OrderDirection.ASC }, { id: OrderDirection.ASC }]],
    [BookingSearchOrderBy.STAFF_NAME, [{ startAt: OrderDirection.ASC }, { id: OrderDirection.ASC }]],
    [BookingSearchOrderBy.STATUS, [{ status: OrderDirection.ASC }, { id: OrderDirection.ASC }]],
    [BookingSearchOrderBy.SOURCE, [{ source: OrderDirection.ASC }, { id: OrderDirection.ASC }]],
  ])('orders by %s', async (orderBy, expected) => {
    await service.search('biz', {
      businessId: 'biz',
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
      businessId: 'biz',
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
      booking({ id: 'low', servicePrice: new Prisma.Decimal('10') }),
      booking({ id: 'high', servicePrice: new Prisma.Decimal('100') }),
    ]);
    count.mockResolvedValue(2);

    const result = await service.search('biz', {
      businessId: 'biz',
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

describe('BookingsService.listForCalendar', () => {
  const findMany = vi.fn();
  const db = { bookingItem: { findMany } };

  let service: BookingsService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        BookingsService,
        { provide: DatabaseService, useValue: db },
        { provide: CalendarService, useValue: {} },
        { provide: StaffService, useValue: {} },
        { provide: BusinessService, useValue: {} },
        { provide: StaffEarningsService, useValue: {} },
        { provide: EventEmitter2, useValue: { emit: vi.fn() } },
      ],
    }).compile();
    service = module.get(BookingsService);
  });

  it('returns visible visits and every linked block id, including cancelled', async () => {
    const rangeStart = new Date('2026-09-21T00:00:00.000Z');
    const rangeEnd = new Date('2026-09-28T00:00:00.000Z');
    findMany.mockResolvedValue([
      booking({ id: 'visible', calendarEventId: 'ev-1', customPrice: new Prisma.Decimal('10.00') }),
      booking({ id: 'cancelled', status: BookingStatus.CANCELLED, calendarEventId: 'ev-2' }),
      booking({ id: 'noshow', status: BookingStatus.NO_SHOW, calendarEventId: null }),
    ].map((row) => ({
      ...row.items[0],
      booking: {
        id: row.id,
        clientFirstName: row.clientFirstName,
        clientLastName: row.clientLastName,
        status: row.status,
      },
    })));

    const feed = await service.listForCalendar('biz', rangeStart, rangeEnd, ['anna']);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        businessId: 'biz',
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
        chargedPrice: true,
        customPrice: true,
        startAt: true,
        endAt: true,
        calendarEventId: true,
        booking: {
          select: {
            id: true,
            clientFirstName: true,
            clientLastName: true,
            status: true,
          },
        },
      },
    });
    expect(feed.bookings.map((item) => item.id)).toEqual(['visible', 'noshow']);
    expect(feed.bookings[0].customPrice).toBe('10.00');
    expect(feed.bookings[0].servicePrice).toBe('50.00');
    expect(feed.linkedEventIds).toEqual(['ev-1', 'ev-2']);
  });
});
