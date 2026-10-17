import { CancelledBy } from '@prisma/client';
import { booking } from '../../../../../test/factories/booking.factory.js';
import { AuditActorRole } from '../../../audit/enums/audit-actor-role.enum.js';
import { BookingStatus } from '../../enums/booking-status.enum.js';
import { BookingLifecycleService } from './booking-lifecycle.service.js';

const actor = { name: 'Owner', role: AuditActorRole.OWNER };
function setup() {
  const old = booking({ item: { calendarEventId: 'event' } });
  const cancelled = booking({ status: BookingStatus.CANCELLED });
  const tx = {
    booking: {
      update: vi.fn().mockResolvedValue(cancelled),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
  let committed = false;
  const db = {
    booking: { findMany: vi.fn().mockResolvedValue([old]) },
    $transaction: vi.fn(async (run: (value: typeof tx) => unknown) => {
      const result = await run(tx);
      committed = true;
      return result;
    }),
  };
  const calendar = { deleteBookingEvents: vi.fn() };
  const locations = {
    getAutomaticProcessingCutoffs: vi
      .fn()
      .mockResolvedValue(new Map([['biz', null]])),
    acquireActiveOperationLock: vi.fn().mockResolvedValue(true),
  };
  const earnings = { recordForCompletedBooking: vi.fn() };
  const orders = {
    removeDraftProductsForBooking: vi.fn().mockResolvedValue([]),
    syncCompletedBooking: vi.fn(),
  };
  const write = { lockUnchangedBooking: vi.fn(), lockActiveLocation: vi.fn() };
  const events = {
    audit: vi.fn(() => {
      expect(committed).toBe(true);
    }),
    notifyStatus: vi.fn(),
  };
  const reschedule = { restoreBookingEvents: vi.fn() };
  const service = new BookingLifecycleService(
    db as never,
    calendar as never,
    locations as never,
    earnings as never,
    orders as never,
    {} as never,
    write as never,
    events as never,
    reschedule as never,
  );
  return {
    old,
    tx,
    db,
    calendar,
    events,
    reschedule,
    service,
    orders,
    earnings,
  };
}
describe('Booking lifecycle transaction boundaries', () => {
  it('releases cancelled calendar events and audits only after commit', async () => {
    const { service, old, tx, calendar, events } = setup();
    await service.cancel(old, actor, CancelledBy.STAFF, {});
    expect(calendar.deleteBookingEvents).toHaveBeenCalledWith(['event'], tx);
    expect(tx.booking.update.mock.calls[0][0].data.items).toEqual({
      updateMany: { where: {}, data: { calendarEventId: null } },
    });
    expect(events.audit).toHaveBeenCalledOnce();
  });
  it('emits no cancellation event if the calendar write rolls back', async () => {
    const { service, old, calendar, events } = setup();
    calendar.deleteBookingEvents.mockRejectedValue(new Error('write failed'));
    await expect(
      service.cancel(old, actor, CancelledBy.STAFF, {}),
    ).rejects.toThrow('write failed');
    expect(events.audit).not.toHaveBeenCalled();
    expect(events.notifyStatus).not.toHaveBeenCalled();
  });
  it('checks availability and restores events before reopening a cancelled booking', async () => {
    const { service, tx, reschedule } = setup();
    const old = booking({ status: BookingStatus.CANCELLED });
    await service.updateStatus(old, actor, { status: BookingStatus.CONFIRMED });
    expect(reschedule.restoreBookingEvents).toHaveBeenCalledWith(old, tx);
    expect(tx.booking.update.mock.calls[0][0].data).toMatchObject({
      cancelledAt: null,
      cancelledBy: null,
      cancellationReason: null,
    });
  });
  it('does not complete a booking changed since the cron selected it', async () => {
    const { service, old, tx, orders, earnings } = setup();
    const now = new Date('2026-10-17');
    await expect(service.completeElapsed(now)).resolves.toBe(0);
    expect(tx.booking.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          updatedAt: old.updatedAt,
          endAt: { lte: now },
        }),
      }),
    );
    expect(orders.syncCompletedBooking).not.toHaveBeenCalled();
    expect(earnings.recordForCompletedBooking).not.toHaveBeenCalled();
  });
});
