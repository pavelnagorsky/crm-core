import { BookingSlotLockService } from './booking-slot-lock.service.js';

describe('BookingSlotLockService', () => {
  const startAt = new Date('2026-10-17T10:00:00Z');
  const endAt = new Date('2026-10-17T11:00:00Z');
  const items = ['staff-1', 'staff-2', 'staff-1'].map((staffId) => ({
    staffId,
    startAt,
    endAt,
  }));

  it('rejects overlapping items assigned to the same staff before querying the calendar', async () => {
    const staff = { findShiftForDate: vi.fn() };
    const service = new BookingSlotLockService(staff as never, {} as never);
    await expect(
      service.assertSlotsAvailable(
        'location',
        [items[0], items[0]],
        'UTC',
        {} as never,
      ),
    ).rejects.toMatchObject({ errorCode: 'BOOKING_SLOT_UNAVAILABLE' });
    expect(staff.findShiftForDate).not.toHaveBeenCalled();
  });

  it('excludes every old event when moving a multi-service booking', async () => {
    const staff = { findShiftForDate: vi.fn() };
    const calendar = {
      listBlockingEvents: vi.fn().mockResolvedValue([]),
      isSlotFree: vi.fn().mockReturnValue(true),
    };
    const service = new BookingSlotLockService(
      staff as never,
      calendar as never,
    );
    const moved = items
      .slice(0, 2)
      .map((item, index) => ({ ...item, calendarEventId: `event-${index}` }));
    await service.assertSlotsAvailable('location', moved, 'UTC', {} as never);
    expect(
      calendar.listBlockingEvents.mock.calls.every(
        (call) =>
          JSON.stringify(call[4]) === JSON.stringify(['event-0', 'event-1']),
      ),
    ).toBe(true);
  });

  it('locks each staff/day once in a stable order regardless of item order', async () => {
    const service = new BookingSlotLockService({} as never, {} as never);
    const firstTx = { $executeRaw: vi.fn() };
    const secondTx = { $executeRaw: vi.fn() };
    await service.lockSlots(items, 'UTC', firstTx as never);
    await service.lockSlots([...items].reverse(), 'UTC', secondTx as never);
    const keys = firstTx.$executeRaw.mock.calls.map((call) => call[1]);
    expect(keys).toHaveLength(2);
    expect(keys[0] < keys[1]).toBe(true);
    expect(keys).toEqual(
      secondTx.$executeRaw.mock.calls.map((call) => call[1]),
    );
  });

  it('rechecks a slot using the open transaction and excludes its existing calendar event', async () => {
    const shift = { id: 'shift-1' };
    const events = [{ id: 'block-1' }];
    const staff = { findShiftForDate: vi.fn().mockResolvedValue(shift) };
    const calendar = {
      listBlockingEvents: vi.fn().mockResolvedValue(events),
      isSlotFree: vi.fn().mockReturnValue(false),
    };
    const tx = {} as never;
    const item = { ...items[0], calendarEventId: 'event-1' };
    const service = new BookingSlotLockService(
      staff as never,
      calendar as never,
    );
    await expect(
      service.assertSlotsAvailable('location-1', [item], 'UTC', tx),
    ).rejects.toMatchObject({
      errorCode: 'BOOKING_SLOT_UNAVAILABLE',
    });
    expect(staff.findShiftForDate).toHaveBeenCalledWith(
      'staff-1',
      new Date('2026-10-17'),
      tx,
    );
    expect(calendar.listBlockingEvents).toHaveBeenCalledWith(
      'location-1',
      ['staff-1'],
      startAt,
      endAt,
      ['event-1'],
      tx,
    );
    expect(calendar.isSlotFree).toHaveBeenCalledWith(
      'staff-1',
      '2026-10-17',
      startAt,
      endAt,
      shift,
      events,
      'UTC',
    );
  });
});
