import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Booking, BookingSource, BookingStatus, Prisma } from '@prisma/client';
import { DatabaseService } from '../../database/database.service.js';
import { CalendarService } from '../calendar/calendar.service.js';
import { StaffService } from '../staff/staff.service.js';
import { BusinessService } from '../business/business.service.js';
import { StaffEarningsService } from '../payroll/earnings/staff-earnings.service.js';
import { BookingsService } from './bookings.service.js';
import { BookingSearchRequestDto } from './dto/booking-search-request.dto.js';

function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'booking-1',
    businessId: 'biz',
    staffId: 'anna',
    serviceId: 'haircut',
    clientId: 'client',
    startAt: new Date('2026-09-24T10:00:00.000Z'),
    endAt: new Date('2026-09-24T11:00:00.000Z'),
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
  };
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
  const db = {
    booking: { findMany, count },
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
      serviceId: 'haircut',
      createdFrom: '2026-09-01T00:00:00.000Z',
      createdTo: '2026-09-30T23:59:59.000Z',
    } as BookingSearchRequestDto);

    expect(findMany.mock.calls[0][0].where).toEqual({
      businessId: 'biz',
      deletedAt: null,
      serviceId: 'haircut',
      createdAt: {
        gte: new Date('2026-09-01T00:00:00.000Z'),
        lte: new Date('2026-09-30T23:59:59.000Z'),
      },
      OR: [
        { clientFirstName: { contains: 'стрижка', mode: 'insensitive' } },
        { clientLastName: { contains: 'стрижка', mode: 'insensitive' } },
        { clientPhone: { contains: 'стрижка' } },
        { clientEmail: { contains: 'стрижка', mode: 'insensitive' } },
        { serviceTitle: { contains: 'стрижка', mode: 'insensitive' } },
        { staffName: { contains: 'стрижка', mode: 'insensitive' } },
        { notes: { contains: 'стрижка', mode: 'insensitive' } },
        { internalNotes: { contains: 'стрижка', mode: 'insensitive' } },
        { cancellationReason: { contains: 'стрижка', mode: 'insensitive' } },
      ],
    });
  });
});
