import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BookingStatus } from '@prisma/client';
import { DatabaseService } from '../../database/database.service.js';
import { BusinessService } from '../business/business.service.js';
import { BookingCronService } from './booking-cron.service.js';
import { BookingsService } from './bookings.service.js';

describe('BookingCronService.sendReminders', () => {
  const db = {
    booking: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  };
  const business = {
    getLocalesByIds: vi.fn().mockResolvedValue(new Map([['biz', { timezone: 'UTC' }]])),
  };
  const emitter = { emit: vi.fn() };
  const bookings = { completeElapsed: vi.fn() };

  let service: BookingCronService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        BookingCronService,
        { provide: DatabaseService, useValue: db },
        { provide: BookingsService, useValue: bookings },
        { provide: EventEmitter2, useValue: emitter },
        { provide: BusinessService, useValue: business },
      ],
    }).compile();
    service = module.get(BookingCronService);
  });

  it('reminds bookings that start within the next 24 hours and skips the rest', async () => {
    const due = {
      id: 'b1',
      businessId: 'biz',
      clientEmail: 'a@example.com',
      status: BookingStatus.CONFIRMED,
    };
    db.booking.findMany.mockResolvedValue([due]);
    db.booking.update.mockResolvedValue(due);

    await service.sendReminders();

    const where = db.booking.findMany.mock.calls[0][0].where;
    const from = where.startAt.gt as Date;
    const to = where.startAt.lte as Date;
    expect(to.getTime() - from.getTime()).toBe(24 * 60 * 60 * 1000);
    expect(where.reminderSentAt).toBeNull();
    expect(where.status.in).toEqual([BookingStatus.PENDING, BookingStatus.CONFIRMED]);
    expect(emitter.emit).toHaveBeenCalledTimes(1);
    expect(db.booking.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { reminderSentAt: expect.any(Date) },
    });
  });
});
