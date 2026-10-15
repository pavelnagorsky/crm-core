import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BookingStatus } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { LocationService } from '../../location/location.service.js';
import { BookingCronService } from './booking-cron.service.js';
import { BookingsService } from '../bookings.service.js';

describe('BookingCronService.sendReminders', () => {
  const db = {
    booking: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  };
  const business = {
    acquireActiveOperationLock: vi.fn(),
    getLocalesByIds: vi
      .fn()
      .mockResolvedValue(new Map([['biz', { timezone: 'UTC' }]])),
  };
  const emitter = { emit: vi.fn() };
  const database = {
    ...db,
    $transaction: vi.fn(async (callback) => callback(db)),
  };
  const bookings = { completeElapsed: vi.fn() };

  let service: BookingCronService;

  beforeEach(async () => {
    vi.clearAllMocks();
    business.acquireActiveOperationLock.mockResolvedValue(true);
    business.getLocalesByIds.mockResolvedValue(
      new Map([['biz', { timezone: 'UTC' }]]),
    );
    db.booking.updateMany.mockResolvedValue({ count: 1 });
    const module = await Test.createTestingModule({
      providers: [
        BookingCronService,
        { provide: DatabaseService, useValue: database },
        { provide: BookingsService, useValue: bookings },
        { provide: EventEmitter2, useValue: emitter },
        { provide: LocationService, useValue: business },
      ],
    }).compile();
    service = module.get(BookingCronService);
  });

  it('reminds bookings that start within the next 24 hours and skips the rest', async () => {
    const due = {
      id: 'b1',
      locationId: 'biz',
      clientEmail: 'a@example.com',
      clientFirstName: 'A',
      clientLastName: 'B',
      startAt: new Date('2026-09-24T10:00:00.000Z'),
      endAt: new Date('2026-09-24T11:00:00.000Z'),
      status: BookingStatus.CONFIRMED,
      items: [
        {
          serviceTitle: 'Haircut',
          staffName: 'Anna',
        },
      ],
    };
    db.booking.findMany.mockResolvedValue([due]);

    await service.sendReminders();

    const where = db.booking.findMany.mock.calls[0][0].where;
    const from = where.startAt.gt as Date;
    const to = where.startAt.lte as Date;
    expect(to.getTime() - from.getTime()).toBe(24 * 60 * 60 * 1000);
    expect(where.reminderSentAt).toBeNull();
    expect(where.status.in).toEqual([
      BookingStatus.PENDING,
      BookingStatus.CONFIRMED,
    ]);
    expect(emitter.emit).toHaveBeenCalledTimes(1);
    expect(where.location).toEqual({
      deletedAt: null,
      brand: { deletedAt: null },
    });
    expect(db.booking.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'b1',
        deletedAt: null,
        reminderSentAt: null,
        status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
        location: { deletedAt: null, brand: { deletedAt: null } },
      },
      data: { reminderSentAt: expect.any(Date) },
    });
  });

  it('skips reminders when the location disappeared from the active locale lookup', async () => {
    db.booking.findMany.mockResolvedValue([{ id: 'b1', locationId: 'biz' }]);
    business.getLocalesByIds.mockResolvedValue(new Map());
    await service.sendReminders();
    expect(db.booking.updateMany).not.toHaveBeenCalled();
    expect(emitter.emit).not.toHaveBeenCalled();
  });

  it('rechecks business state before sending a reminder', async () => {
    db.booking.findMany.mockResolvedValue([{ id: 'b1', locationId: 'biz' }]);
    business.acquireActiveOperationLock.mockResolvedValue(false);
    await service.sendReminders();
    expect(db.booking.updateMany).not.toHaveBeenCalled();
    expect(emitter.emit).not.toHaveBeenCalled();
  });
});
