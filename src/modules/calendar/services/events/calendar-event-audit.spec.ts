import {
  CalendarEvent,
  CalendarEventRepeatType,
  CalendarEventType,
} from '@prisma/client';
import { AuditActorRole } from '../../../audit/enums/audit-actor-role.enum.js';
import { CalendarEventService } from './calendar-event.service.js';

describe('Calendar block audit', () => {
  const actor = { id: 'owner', name: 'Owner', role: AuditActorRole.OWNER };
  const block: CalendarEvent = {
    id: 'block',
    locationId: 'location',
    staffId: null,
    title: 'Closed',
    reason: null,
    notes: null,
    type: CalendarEventType.BLOCK,
    repeatType: CalendarEventRepeatType.WEEKLY,
    startDateTime: new Date('2026-11-04T09:00:00Z'),
    endDateTime: new Date('2026-11-04T10:00:00Z'),
    daysMask: '1111100',
    repeatUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const tx = {
    calendarEvent: { create: vi.fn() },
    calendarEventCancelledOccurrence: { upsert: vi.fn(), createMany: vi.fn() },
  };
  const db = {
    $transaction: vi.fn(),
    calendarEvent: {
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      create: vi.fn(),
    },
    calendarEventCancelledOccurrence: tx.calendarEventCancelledOccurrence,
  };
  const events = { emit: vi.fn() };
  const service = new CalendarEventService(db as never, events as never);
  beforeEach(() => {
    vi.resetAllMocks();
    db.calendarEvent.findFirst.mockResolvedValue(block);
    db.$transaction.mockImplementation((operation) =>
      typeof operation === 'function' ? operation(tx) : Promise.all(operation),
    );
    db.calendarEvent.create.mockResolvedValue(block);
    tx.calendarEventCancelledOccurrence.createMany.mockResolvedValue({
      count: 1,
    });
  });

  it('records a location-wide block with no staff assignment', async () => {
    await service.create(
      'location',
      {
        repeatType: CalendarEventRepeatType.WEEKLY,
        startDateTime: block.startDateTime.toISOString(),
        endDateTime: block.endDateTime.toISOString(),
      },
      actor,
    );
    expect(events.emit).toHaveBeenCalledWith(
      'audit',
      expect.objectContaining({
        entityType: 'CALENDAR',
        entityId: 'block',
        locationId: 'location',
        eventType: 'CALENDAR_BLOCK_CREATED',
        actor,
      }),
    );
  });

  it('keeps staff-specific block events in the staff history', async () => {
    db.calendarEvent.create.mockResolvedValue({ ...block, staffId: 'staff' });
    await service.create(
      'location',
      {
        staffIds: ['staff'],
        repeatType: CalendarEventRepeatType.WEEKLY,
        startDateTime: block.startDateTime.toISOString(),
        endDateTime: block.endDateTime.toISOString(),
      },
      actor,
    );
    expect(events.emit).toHaveBeenCalledWith(
      'audit',
      expect.objectContaining({
        entityType: 'STAFF',
        entityId: 'staff',
        eventType: 'CALENDAR_BLOCK_CREATED',
      }),
    );
  });

  it('records a detached occurrence with its original occurrence date and changed times', async () => {
    tx.calendarEvent.create.mockResolvedValue({
      ...block,
      id: 'exception',
      repeatType: CalendarEventRepeatType.NONE,
      startDateTime: new Date('2026-11-11T11:00:00Z'),
    });
    await service.moveOccurrence(
      'location',
      'block',
      {
        thisOnly: true,
        occurrenceDate: '2026-11-11',
        startDateTime: '2026-11-11T11:00:00Z',
        endDateTime: '2026-11-11T12:00:00Z',
      },
      actor,
    );
    expect(events.emit).toHaveBeenCalledWith(
      'audit',
      expect.objectContaining({
        eventType: 'CALENDAR_BLOCK_MOVED',
        payload: expect.objectContaining({
          occurrenceDate: '2026-11-11',
          changes: expect.arrayContaining([
            expect.objectContaining({
              field: 'startDateTime',
              to: '2026-11-11T11:00:00.000Z',
            }),
          ]),
        }),
      }),
    );
  });

  it.each([true, false])(
    'records deletion with thisOnly=%s',
    async (thisOnly) => {
      await service.delete(
        'location',
        'block',
        { thisOnly, occurrenceDate: thisOnly ? '2026-11-11' : undefined },
        actor,
      );
      expect(events.emit).toHaveBeenCalledWith(
        'audit',
        expect.objectContaining({
          eventType: 'CALENDAR_BLOCK_DELETED',
          actionType: 'DELETE',
          payload: expect.objectContaining({
            occurrenceDate: thisOnly ? '2026-11-11' : undefined,
          }),
        }),
      );
    },
  );

  it('does not record an occurrence change when its transaction fails', async () => {
    tx.calendarEvent.create.mockRejectedValue(new Error('Insert failed'));
    await expect(
      service.update(
        'location',
        'block',
        {
          thisOnly: true,
          occurrenceDate: '2026-11-11',
          repeatType: CalendarEventRepeatType.WEEKLY,
          startDateTime: block.startDateTime.toISOString(),
          endDateTime: block.endDateTime.toISOString(),
        },
        actor,
      ),
    ).rejects.toThrow('Insert failed');
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('does not report an already cancelled occurrence as a new deletion', async () => {
    tx.calendarEventCancelledOccurrence.createMany.mockResolvedValue({
      count: 0,
    });
    await service.delete(
      'location',
      'block',
      { thisOnly: true, occurrenceDate: '2026-11-11' },
      actor,
    );
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('records reassignment in both affected staff histories', async () => {
    db.calendarEvent.findFirst.mockResolvedValue({
      ...block,
      staffId: 'previous-staff',
    });
    db.calendarEvent.update.mockResolvedValue({
      ...block,
      staffId: 'next-staff',
    });
    await service.update(
      'location',
      'block',
      {
        thisOnly: false,
        staffId: 'next-staff',
        repeatType: CalendarEventRepeatType.WEEKLY,
        startDateTime: block.startDateTime.toISOString(),
        endDateTime: block.endDateTime.toISOString(),
      },
      actor,
    );
    expect(events.emit).toHaveBeenCalledTimes(2);
    expect(events.emit).toHaveBeenCalledWith(
      'audit',
      expect.objectContaining({
        entityId: 'previous-staff',
        eventType: 'CALENDAR_BLOCK_UPDATED',
      }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      'audit',
      expect.objectContaining({
        entityId: 'next-staff',
        eventType: 'CALENDAR_BLOCK_UPDATED',
      }),
    );
  });
});
