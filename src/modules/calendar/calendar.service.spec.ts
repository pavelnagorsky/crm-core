import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CalendarEvent, CalendarEventRepeatType, CalendarEventType } from '@prisma/client';
import { DatabaseService } from '../../database/database.service.js';
import { ErrorCode } from '../../shared/validation/error-codes.enum.js';
import { BookingVisibility } from '../business/enums/booking-visibility.enum.js';
import { StaffService } from '../staff/staff.service.js';
import { TimeService } from '../time/time.service.js';
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

describe('CalendarService.getManualAvailableSlots', () => {
  const db = {
    business: { findUnique: vi.fn() },
    service: { findFirst: vi.fn() },
    staffShift: { findMany: vi.fn() },
    calendarEvent: { findMany: vi.fn() },
  };
  const staff = { resolveStaffForService: vi.fn() };
  const compute = {
    groupShiftsByStaffDate: vi.fn().mockReturnValue(new Map()),
    expandBlockEvents: vi.fn().mockReturnValue(new Map()),
    collectSlotsForDate: vi.fn().mockReturnValue([]),
  };

  let service: CalendarService;

  const business = {
    timezone: 'UTC',
    advanceBookingWindowDays: 15,
    slotIntervalMinutes: 30,
    minimumBookingNoticeMinutes: 120,
    bookingVisibility: BookingVisibility.PRIVATE,
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-28T10:00:00.000Z'));
    vi.clearAllMocks();
    db.business.findUnique.mockResolvedValue(business);
    db.service.findFirst.mockResolvedValue({ durationMinutes: 30, bufferMinutes: 0 });
    staff.resolveStaffForService.mockResolvedValue([{ id: 'staff-1' }]);
    db.staffShift.findMany.mockResolvedValue([
      { staffId: 'staff-1', date: new Date('2026-09-28T00:00:00.000Z') },
    ]);
    db.calendarEvent.findMany.mockResolvedValue([]);
    compute.groupShiftsByStaffDate.mockReturnValue(new Map());
    compute.expandBlockEvents.mockReturnValue(new Map());
    compute.collectSlotsForDate.mockReturnValue([9 * 60]);

    const module = await Test.createTestingModule({
      providers: [
        CalendarService,
        { provide: DatabaseService, useValue: db },
        { provide: StaffService, useValue: staff },
        { provide: CalendarComputeService, useValue: compute },
        { provide: EventEmitter2, useValue: { emit: vi.fn() } },
      ],
    }).compile();
    service = module.get(CalendarService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns slots when online booking is closed, including earlier today', async () => {
    const days = await service.getManualAvailableSlots('biz', {
      serviceId: 'service-1',
      from: '2026-09-01',
      to: '2026-09-30',
    });

    expect(days).toEqual([{ date: '2026-09-28', slots: [{ time: '09:00' }] }]);
    expect(db.staffShift.findMany).toHaveBeenCalledWith({
      where: {
        staffId: { in: ['staff-1'] },
        date: { gte: TimeService.dateOnly('2026-09-28'), lte: new Date('2026-09-30T23:59:59.999Z') },
      },
    });
    expect(compute.collectSlotsForDate).toHaveBeenCalledWith(
      '2026-09-28',
      [{ id: 'staff-1' }],
      expect.any(Map),
      expect.any(Map),
      0,
      30,
      30,
    );
  });

  it('returns an empty list when every requested day is before today', async () => {
    const days = await service.getManualAvailableSlots('biz', {
      serviceId: 'service-1',
      from: '2026-09-01',
      to: '2026-09-27',
    });

    expect(days).toEqual([]);
    expect(db.staffShift.findMany).not.toHaveBeenCalled();
  });

  it('rejects a range longer than 62 days', async () => {
    await expect(
      service.getManualAvailableSlots('biz', {
        serviceId: 'service-1',
        from: '2026-09-01',
        to: '2026-11-02',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.BOOKING_SLOT_RANGE_TOO_LONG.code });
    expect(db.business.findUnique).not.toHaveBeenCalled();
  });
});
