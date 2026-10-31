import { BookingExecutionMode } from '@prisma/client';
import { AuditActorRole } from '../../../audit/enums/audit-actor-role.enum.js';
import { booking } from '../../testing/factories/booking.factory.js';
import { BookingSlotLockService } from '../booking-slot-lock.service.js';
import { BookingRescheduleService } from './booking-reschedule.service.js';

function setup() {
  const first = booking({
    item: { id: 'first', serviceId: 'a', calendarEventId: 'event-a' },
  });
  const second = booking({
    item: {
      id: 'second',
      serviceId: 'b',
      staffId: 'boris',
      staffName: 'Boris',
      calendarEventId: 'event-b',
      endAt: new Date('2026-09-24T11:30:00Z'),
    },
  });
  const old = booking({
    executionMode: BookingExecutionMode.PARALLEL,
    bundleId: 'bundle',
    items: [first.items[0], second.items[0]],
    endAt: second.items[0].endAt,
  });
  const staff = {
    resolveStaffForService: vi.fn(async (_location, _service, id) => [{ id }]),
    findById: vi.fn(async (id) => ({ id, name: id })),
    findShiftForDate: vi.fn(async () => ({
      startTime: new Date(),
      endTime: new Date(),
    })),
  };
  const calendar = {
    saveBookingEvent: vi.fn(async (input) => ({ id: input.eventId })),
    listBlockingEvents: vi.fn(async () => []),
    isSlotFree: vi.fn(() => true),
  };
  const db = {
    $executeRaw: vi.fn(),
    bookingItem: { update: vi.fn() },
    booking: { update: vi.fn(async () => old) },
    $transaction: vi.fn(async (callback) => callback(db)),
  };
  const location = { findById: vi.fn(async () => ({ timezone: 'UTC' })) };
  const service = new BookingRescheduleService(
    db as never,
    calendar as never,
    staff as never,
    location as never,
    {} as never,
    {} as never,
    { lockActiveLocation: vi.fn(), lockUnchangedBooking: vi.fn() } as never,
    new BookingSlotLockService(staff as never, calendar as never),
  );
  return { old, service, calendar, db, staff };
}

describe('Parallel booking rescheduling', () => {
  const actor = { name: 'Admin', role: AuditActorRole.OWNER };

  it('shifts the entire team with independent durations and excludes all old events', async () => {
    const { old, service, calendar, db } = setup();
    await service.reschedule(
      old,
      { startAt: '2026-11-10T12:00:00' },
      {},
      actor,
    );
    expect(
      calendar.saveBookingEvent.mock.calls.map(([input]) => [
        input.staffId,
        input.startAt.toISOString(),
        input.endAt.toISOString(),
      ]),
    ).toEqual([
      ['anna', '2026-11-10T12:00:00.000Z', '2026-11-10T13:00:00.000Z'],
      ['boris', '2026-11-10T12:00:00.000Z', '2026-11-10T13:30:00.000Z'],
    ]);
    expect(calendar.listBlockingEvents).toHaveBeenCalledWith(
      old.locationId,
      ['anna'],
      expect.any(Date),
      expect.any(Date),
      ['event-a', 'event-b'],
      db,
    );
    expect(calendar.listBlockingEvents).toHaveBeenCalledWith(
      old.locationId,
      ['boris'],
      expect.any(Date),
      expect.any(Date),
      ['event-a', 'event-b'],
      db,
    );
  });

  it('changes only the specified saved item and preserves all prices', async () => {
    const { old, service, db, staff } = setup();
    await service.reschedule(
      old,
      { staffAssignments: [{ bookingItemId: 'second', staffId: 'carol' }] },
      {},
      actor,
    );
    expect(
      db.bookingItem.update.mock.calls.map(([args]) => [
        args.where.id,
        args.data.staffId,
      ]),
    ).toEqual([
      ['first', 'anna'],
      ['second', 'carol'],
    ]);
    expect(staff.resolveStaffForService).toHaveBeenCalledWith(
      old.locationId,
      'b',
      'carol',
      undefined,
    );
    for (const [args] of db.bookingItem.update.mock.calls)
      expect(args.data).not.toHaveProperty('chargedPrice');
  });

  it('rejects a normal move when a saved team member can no longer perform their service', async () => {
    const { old, service, staff, calendar, db } = setup();
    staff.resolveStaffForService.mockImplementation(
      async (_location, _service, id) => (id === 'boris' ? [] : [{ id }]),
    );
    await expect(
      service.reschedule(old, { startAt: '2026-11-10T12:00:00' }, {}, actor),
    ).rejects.toMatchObject({ errorCode: 'BOOKING_STAFF_NOT_FOUND' });
    expect(calendar.saveBookingEvent).not.toHaveBeenCalled();
    expect(db.bookingItem.update).not.toHaveBeenCalled();
    expect(db.booking.update).not.toHaveBeenCalled();
    expect(staff.resolveStaffForService).toHaveBeenCalledWith(
      old.locationId,
      'b',
      'boris',
      db,
    );
  });

  it.each([
    [{ staffId: 'anna' }, 'BOOKING_PARALLEL_STAFF_REQUIRED'],
    [
      { staffAssignments: [{ bookingItemId: 'other', staffId: 'carol' }] },
      'BOOKING_STAFF_ASSIGNMENT_INVALID',
    ],
    [
      { staffAssignments: [{ bookingItemId: 'second', staffId: 'anna' }] },
      'BOOKING_STAFF_ASSIGNMENT_OVERLAP',
    ],
    [
      {
        staffAssignments: [
          { bookingItemId: 'second', staffId: 'carol' },
          { bookingItemId: 'second', staffId: 'carol' },
        ],
      },
      'BOOKING_STAFF_ASSIGNMENT_INVALID',
    ],
  ])('rejects invalid changes before writing %j', async (dto, errorCode) => {
    const { old, service, db } = setup();
    await expect(service.reschedule(old, dto, {}, actor)).rejects.toMatchObject(
      { errorCode },
    );
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('keeps the explicit manual interval without an availability check and still rejects overlapping staff', async () => {
    const { old, service, calendar } = setup();
    const interval = {
      startAt: '2026-11-10T12:00:00',
      endAt: '2026-11-10T13:00:00',
    };
    await service.reschedule(old, interval, {}, actor);
    expect(calendar.isSlotFree).not.toHaveBeenCalled();
    expect(
      calendar.saveBookingEvent.mock.calls.map(([input]) =>
        input.endAt.toISOString(),
      ),
    ).toEqual(['2026-11-10T13:00:00.000Z', '2026-11-10T13:00:00.000Z']);
    await expect(
      service.reschedule(
        old,
        {
          ...interval,
          staffAssignments: [{ bookingItemId: 'second', staffId: 'anna' }],
        },
        {},
        actor,
      ),
    ).rejects.toMatchObject({ errorCode: 'BOOKING_STAFF_ASSIGNMENT_OVERLAP' });
  });
});
