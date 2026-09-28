import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CalendarEvent, CalendarEventRepeatType, CalendarEventType } from '@prisma/client';
import { DatabaseService } from '../../database/database.service.js';
import { StaffService } from '../staff/staff.service.js';
import { CalendarComputeService } from './calendar-compute.service.js';
import { CalendarService } from './calendar.service.js';
import { UpdateCalendarEventDto } from './dto/update-calendar-event.dto.js';

function seriesEvent(): CalendarEvent {
  return {
    id: 'event-1',
    businessId: 'biz',
    staffId: 'staff-1',
    type: CalendarEventType.BLOCK,
    reason: null,
    title: 'Обед',
    notes: null,
    repeatType: CalendarEventRepeatType.WEEKLY,
    startDateTime: new Date('2026-10-01T09:00:00.000Z'),
    endDateTime: new Date('2026-10-01T10:00:00.000Z'),
    daysMask: '1111100',
    repeatUntil: new Date('2026-12-31'),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function singleOccurrenceUpdate(): UpdateCalendarEventDto {
  return {
    thisOnly: true,
    type: CalendarEventType.BLOCK,
    title: 'Обед',
    startDateTime: '2026-10-08T11:00:00',
    endDateTime: '2026-10-08T12:00:00',
    repeatType: CalendarEventRepeatType.WEEKLY,
    daysMask: '1111100',
    repeatUntil: '2026-12-31',
    occurrenceDate: '2026-10-08',
  };
}

describe('CalendarService.update', () => {
  const tx = {
    calendarEventCancelledOccurrence: { upsert: vi.fn() },
    calendarEvent: { create: vi.fn() },
  };
  const db = {
    calendarEvent: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<CalendarEvent>) => fn(tx)),
  };

  let service: CalendarService;

  beforeEach(async () => {
    vi.clearAllMocks();
    db.$transaction.mockImplementation(async (fn: (client: typeof tx) => Promise<CalendarEvent>) => fn(tx));
    const module = await Test.createTestingModule({
      providers: [
        CalendarService,
        { provide: DatabaseService, useValue: db },
        { provide: StaffService, useValue: {} },
        { provide: CalendarComputeService, useValue: {} },
        { provide: EventEmitter2, useValue: { emit: vi.fn() } },
      ],
    }).compile();
    service = module.get(CalendarService);
  });

  it('detaches one occurrence as a non-repeating event', async () => {
    db.calendarEvent.findUnique.mockResolvedValue(seriesEvent());
    tx.calendarEvent.create.mockResolvedValue({ id: 'exception-1' });

    await service.update('event-1', singleOccurrenceUpdate());

    expect(tx.calendarEventCancelledOccurrence.upsert).toHaveBeenCalledWith({
      where: {
        eventId_occurrenceDate: {
          eventId: 'event-1',
          occurrenceDate: new Date('2026-10-08'),
        },
      },
      create: { eventId: 'event-1', occurrenceDate: new Date('2026-10-08') },
      update: {},
    });
    expect(tx.calendarEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        businessId: 'biz',
        staffId: 'staff-1',
        startDateTime: new Date('2026-10-08T11:00:00'),
        endDateTime: new Date('2026-10-08T12:00:00'),
        repeatType: CalendarEventRepeatType.NONE,
        daysMask: null,
        repeatUntil: null,
      }),
    });
    expect(db.calendarEvent.update).not.toHaveBeenCalled();
  });
});
