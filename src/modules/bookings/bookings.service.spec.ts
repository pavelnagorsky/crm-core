import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Booking, BookingSource, BookingStatus, Prisma } from '@prisma/client';
import { DatabaseService } from '../../database/database.service.js';
import { TimeService } from '../time/time.service.js';
import { CalendarService } from '../calendar/calendar.service.js';
import { StaffService } from '../staff/staff.service.js';
import { BusinessService } from '../business/business.service.js';
import { StaffEarningsService } from '../payroll/earnings/staff-earnings.service.js';
import { BookingsService } from './bookings.service.js';

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
        TimeService,
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
