import { Prisma } from '@prisma/client';
import { AuditActorRole } from '../../audit/enums/audit-actor-role.enum.js';
import { BookingStatus } from '../enums/booking-status.enum.js';
import { booking } from '../testing/factories/booking.factory.js';
import { BookingClientService } from './booking-client.service.js';
import { BookingRescheduleService } from './write/booking-reschedule.service.js';

function setup() {
  const old = booking({
    startAt: new Date('2026-10-28T10:00:00Z'),
    endAt: new Date('2026-10-28T11:00:00Z'),
    item: {
      calendarEventId: 'event',
      customPrice: new Prisma.Decimal('42'),
      staffId: 'anna',
    },
  });
  const location = {
    timezone: 'Europe/Minsk',
    slotIntervalMinutes: 15,
    advanceBookingWindowDays: 60,
    minimumBookingNoticeMinutes: 60,
  };
  const locations = { findById: vi.fn().mockResolvedValue(location) };
  const calendar = {
    getRescheduleSlots: vi
      .fn()
      .mockResolvedValue([{ date: '2026-10-29', slots: [{ time: '14:00' }] }]),
    saveBookingEvent: vi.fn().mockResolvedValue({ id: 'event' }),
  };
  const slots = { lockSlots: vi.fn(), assertSlotsAvailable: vi.fn() };
  const write = { lockActiveLocation: vi.fn(), lockUnchangedBooking: vi.fn() };
  const tx = {
    booking: {
      update: vi.fn().mockResolvedValue({
        ...old,
        startAt: new Date('2026-10-29T11:00:00Z'),
      }),
    },
    bookingItem: { update: vi.fn() },
  };
  const db = {
    $transaction: vi.fn(async (run: (value: typeof tx) => unknown) => run(tx)),
  };
  const events = { updated: vi.fn(), notifyStatus: vi.fn() };
  const staff = {
    resolveStaffForService: vi.fn().mockResolvedValue([{ id: 'anna' }]),
  };
  const reschedule = new BookingRescheduleService(
    db as never,
    calendar as never,
    staff as never,
    locations as never,
    {} as never,
    {} as never,
    write as never,
    slots as never,
  );
  const service = new BookingClientService(
    reschedule,
    {} as never,
    calendar as never,
    events as never,
  );
  return { service, old, calendar, slots, write, tx, events, staff, location };
}

describe('Client booking changes', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-26T09:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('moves in the location timezone without changing staff, prices or duration, then audits and notifies', async () => {
    const { service, old, tx, slots, write, events, calendar, staff } = setup();
    await service.rescheduleByClient(old, {
      startAt: '2026-10-29T14:00:00',
    });
    expect(calendar.getRescheduleSlots).not.toHaveBeenCalled();
    expect(staff.resolveStaffForService).toHaveBeenCalledWith(
      'biz',
      'haircut',
      'anna',
      tx,
    );
    expect(write.lockUnchangedBooking).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ id: 'booking-1' }),
    );
    expect(slots.assertSlotsAvailable).toHaveBeenCalledWith(
      'biz',
      expect.any(Array),
      'Europe/Minsk',
      tx,
    );
    expect(tx.bookingItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          staffId: 'anna',
          staffName: 'Anna',
          startAt: new Date('2026-10-29T11:00:00Z'),
          endAt: new Date('2026-10-29T12:00:00Z'),
          calendarEventId: 'event',
        },
      }),
    );
    expect(tx.booking.update.mock.calls[0][0].data).toEqual({
      startAt: new Date('2026-10-29T11:00:00Z'),
      endAt: new Date('2026-10-29T12:00:00Z'),
      reminderSentAt: null,
    });
    expect(events.updated).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ role: AuditActorRole.CLIENT }),
    );
    expect(events.notifyStatus).toHaveBeenCalledWith(
      expect.anything(),
      'RESCHEDULED',
    );
  });

  it('rejects a slot that became occupied after the preview, before changing calendar or booking', async () => {
    const { service, old, calendar, tx, slots, events } = setup();
    slots.assertSlotsAvailable.mockRejectedValue(new Error('slot occupied'));
    await expect(
      service.rescheduleByClient(old, {
        startAt: '2026-10-29T14:00:00',
      }),
    ).rejects.toThrow('slot occupied');
    expect(calendar.saveBookingEvent).not.toHaveBeenCalled();
    expect(tx.booking.update).not.toHaveBeenCalled();
    expect(events.updated).not.toHaveBeenCalled();
    expect(events.notifyStatus).not.toHaveBeenCalled();
  });

  it('rejects stale booking data before writing', async () => {
    const { service, old, write, tx } = setup();
    write.lockUnchangedBooking.mockRejectedValue(
      new Error('concurrent update'),
    );
    await expect(
      service.rescheduleByClient(old, {
        startAt: '2026-10-29T14:00:00',
      }),
    ).rejects.toThrow('concurrent update');
    expect(tx.bookingItem.update).not.toHaveBeenCalled();
  });

  it.each([
    BookingStatus.CANCELLED,
    BookingStatus.COMPLETED,
    BookingStatus.NO_SHOW,
  ])('rejects changes to %s', async (status) => {
    const { service, old, calendar } = setup();
    old.status = status;
    await expect(
      service.rescheduleByClient(old, { startAt: '2026-10-29T14:00:00' }),
    ).rejects.toMatchObject({ errorCode: 'BOOKING_CLIENT_ACTION_UNAVAILABLE' });
    expect(calendar.getRescheduleSlots).not.toHaveBeenCalled();
  });

  it('rejects a booking that starts while waiting for the slot locks', async () => {
    const { service, old, slots, calendar } = setup();
    slots.lockSlots.mockImplementation(() => {
      vi.setSystemTime(new Date('2026-10-28T10:00:00Z'));
    });
    await expect(
      service.rescheduleByClient(old, {
        startAt: '2026-10-29T14:00:00',
      }),
    ).rejects.toMatchObject({ errorCode: 'BOOKING_CLIENT_ACTION_UNAVAILABLE' });
    expect(calendar.saveBookingEvent).not.toHaveBeenCalled();
  });

  it('rejects a destination outside the time grid', async () => {
    const { service, old, tx } = setup();
    await expect(
      service.rescheduleByClient(old, {
        startAt: '2026-10-29T14:01:00',
      }),
    ).rejects.toMatchObject({ errorCode: 'BOOKING_SLOT_UNAVAILABLE' });
    expect(tx.booking.update).not.toHaveBeenCalled();
  });

  it('rejects staff who can no longer perform the booked service inside the transaction', async () => {
    const { service, old, staff, tx } = setup();
    staff.resolveStaffForService.mockResolvedValue([]);
    await expect(
      service.rescheduleByClient(old, { startAt: '2026-10-29T14:00:00' }),
    ).rejects.toMatchObject({ errorCode: 'BOOKING_STAFF_NOT_FOUND' });
    expect(tx.booking.update).not.toHaveBeenCalled();
  });

  it('rechecks whether the visit has started after the availability queries', async () => {
    const { service, old, slots, tx } = setup();
    slots.assertSlotsAvailable.mockImplementation(() => {
      vi.setSystemTime(old.startAt);
    });
    await expect(
      service.rescheduleByClient(old, { startAt: '2026-10-29T14:00:00' }),
    ).rejects.toMatchObject({ errorCode: 'BOOKING_CLIENT_ACTION_UNAVAILABLE' });
    expect(tx.bookingItem.update).not.toHaveBeenCalled();
  });

  it('returns a committed reschedule if the notification cannot be queued', async () => {
    const { service, old, events } = setup();
    events.notifyStatus.mockRejectedValue(new Error('locale unavailable'));
    await expect(
      service.rescheduleByClient(old, { startAt: '2026-10-29T14:00:00' }),
    ).resolves.toMatchObject({ startAt: new Date('2026-10-29T11:00:00Z') });
    expect(events.updated).toHaveBeenCalledOnce();
  });

  it('does not send a new reminder or notification for an unchanged time', async () => {
    const { service, old, tx, events } = setup();
    await expect(
      service.rescheduleByClient(old, { startAt: '2026-10-28T13:00:00' }),
    ).resolves.toBe(old);
    expect(tx.booking.update).not.toHaveBeenCalled();
    expect(events.updated).not.toHaveBeenCalled();
    expect(events.notifyStatus).not.toHaveBeenCalled();
  });

  it('rejects nonexistent local times instead of moving the visit to another hour', async () => {
    const { service, location, tx } = setup();
    vi.setSystemTime(new Date('2027-03-27T09:00:00Z'));
    location.timezone = 'Europe/Berlin';
    const scheduled = booking({
      startAt: new Date('2027-03-30T10:00:00Z'),
      endAt: new Date('2027-03-30T11:00:00Z'),
    });
    await expect(
      service.rescheduleByClient(scheduled, { startAt: '2027-03-28T02:30:00' }),
    ).rejects.toMatchObject({ errorCode: 'BOOKING_SLOT_UNAVAILABLE' });
    expect(tx.booking.update).not.toHaveBeenCalled();
  });
});
