import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { BookingStatus } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { LocationService } from '../../location/services/location.service.js';
import { ReviewRequestNotification } from '../../notifications/messages/review-request.notification.js';
import { ReviewsFacade } from '../../reviews/reviews.facade.js';
import { BookingsFacade } from '../bookings.facade.js';
import {
  REVIEW_REQUEST_DELAY_MS,
  REVIEW_REQUEST_MAX_AGE_MS,
} from '../rules/booking-cron.rules.js';
import { BookingClientTokenService } from './booking-client-token.service.js';
import { BookingCronService } from './booking-cron.service.js';

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
  const reviews = { findReviewedBookingIds: vi.fn() };
  const clientTokens = {
    generateClientToken: vi.fn(),
    managementUrl: vi.fn(),
  };

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
        { provide: BookingsFacade, useValue: bookings },
        { provide: EventEmitter2, useValue: emitter },
        { provide: LocationService, useValue: business },
        { provide: ReviewsFacade, useValue: reviews },
        { provide: BookingClientTokenService, useValue: clientTokens },
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
    expect(where.status).toBe(BookingStatus.CONFIRMED);
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
        updatedAt: undefined,
        status: BookingStatus.CONFIRMED,
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

describe('BookingCronService.sendReviewRequests', () => {
  const db = { booking: { findMany: vi.fn(), updateMany: vi.fn() } };
  const locations = {
    acquireActiveOperationLock: vi.fn(),
    getLocalesByIds: vi.fn(),
  };
  const emitter = { emit: vi.fn() };
  const database = {
    ...db,
    $transaction: vi.fn(async (callback) => callback(db)),
  };
  const reviews = { findReviewedBookingIds: vi.fn() };
  const clientTokens = {
    generateClientToken: vi.fn().mockReturnValue('signed-token'),
    managementUrl: vi.fn(
      (token: string) => `https://app.example/manage#${token}`,
    ),
  };
  const completed = {
    id: 'b1',
    locationId: 'biz',
    clientEmail: 'a@example.com',
    clientFirstName: 'A',
    clientLastName: 'B',
    startAt: new Date('2026-09-24T10:00:00.000Z'),
    endAt: new Date('2026-09-24T11:00:00.000Z'),
    status: BookingStatus.COMPLETED,
    updatedAt: new Date('2026-09-24T11:05:00.000Z'),
    items: [
      { serviceTitle: 'Haircut', staffName: 'Anna' },
      { serviceTitle: 'Color', staffName: 'Anna' },
    ],
  };
  const reviewableLocation = {
    deletedAt: null,
    brand: { deletedAt: null },
    reviewsEnabled: true,
  };

  let service: BookingCronService;

  beforeEach(async () => {
    vi.clearAllMocks();
    locations.acquireActiveOperationLock.mockResolvedValue(true);
    locations.getLocalesByIds.mockResolvedValue(
      new Map([['biz', { timezone: 'Europe/Moscow' }]]),
    );
    reviews.findReviewedBookingIds.mockResolvedValue(new Set());
    db.booking.findMany.mockResolvedValue([completed]);
    db.booking.updateMany.mockResolvedValue({ count: 1 });
    const module = await Test.createTestingModule({
      providers: [
        BookingCronService,
        { provide: DatabaseService, useValue: database },
        { provide: BookingsFacade, useValue: { completeElapsed: vi.fn() } },
        { provide: EventEmitter2, useValue: emitter },
        { provide: LocationService, useValue: locations },
        { provide: ReviewsFacade, useValue: reviews },
        { provide: BookingClientTokenService, useValue: clientTokens },
      ],
    }).compile();
    service = module.get(BookingCronService);
  });

  it('selects completed visits of review-enabled locations in the request window', async () => {
    await service.sendReviewRequests();
    const where = db.booking.findMany.mock.calls[0][0].where;
    const from = where.endAt.gt as Date;
    const to = where.endAt.lte as Date;
    expect(to.getTime() - from.getTime()).toBe(
      REVIEW_REQUEST_MAX_AGE_MS - REVIEW_REQUEST_DELAY_MS,
    );
    expect(where).toMatchObject({
      status: BookingStatus.COMPLETED,
      clientEmail: { not: null },
      reviewRequestSentAt: null,
      deletedAt: null,
      location: reviewableLocation,
    });
  });

  it('claims the booking and emails a management link once', async () => {
    await service.sendReviewRequests();
    expect(db.booking.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'b1',
        deletedAt: null,
        reviewRequestSentAt: null,
        updatedAt: completed.updatedAt,
        status: BookingStatus.COMPLETED,
        location: reviewableLocation,
      },
      data: { reviewRequestSentAt: expect.any(Date) },
    });
    expect(clientTokens.generateClientToken).toHaveBeenCalledWith('b1');
    expect(emitter.emit).toHaveBeenCalledTimes(1);
    const notification = emitter.emit.mock.calls[0][1];
    expect(notification).toBeInstanceOf(ReviewRequestNotification);
    expect(notification.toEmail()).toMatchObject({
      to: 'a@example.com',
      data: {
        serviceTitle: 'Haircut, Color',
        staffName: 'Anna',
        timezone: 'Europe/Moscow',
        manageLink: 'https://app.example/manage#signed-token',
      },
    });
  });

  it('does not ask clients who already reviewed the visit', async () => {
    reviews.findReviewedBookingIds.mockResolvedValue(new Set(['b1']));
    await service.sendReviewRequests();
    expect(db.booking.updateMany).not.toHaveBeenCalled();
    expect(emitter.emit).not.toHaveBeenCalled();
  });

  it('does nothing when there are no candidates', async () => {
    db.booking.findMany.mockResolvedValue([]);
    await service.sendReviewRequests();
    expect(reviews.findReviewedBookingIds).not.toHaveBeenCalled();
    expect(emitter.emit).not.toHaveBeenCalled();
  });

  it('sends nothing when another run claimed the booking first', async () => {
    db.booking.updateMany.mockResolvedValue({ count: 0 });
    await service.sendReviewRequests();
    expect(emitter.emit).not.toHaveBeenCalled();
  });

  it('rechecks the location state before sending', async () => {
    locations.acquireActiveOperationLock.mockResolvedValue(false);
    await service.sendReviewRequests();
    expect(db.booking.updateMany).not.toHaveBeenCalled();
    expect(emitter.emit).not.toHaveBeenCalled();
  });

  it('skips locations missing from the active locale lookup', async () => {
    locations.getLocalesByIds.mockResolvedValue(new Map());
    await service.sendReviewRequests();
    expect(db.booking.updateMany).not.toHaveBeenCalled();
    expect(emitter.emit).not.toHaveBeenCalled();
  });
});
