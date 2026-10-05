import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CalendarEvent, CalendarEventRepeatType, CalendarEventType } from '@prisma/client';
import { DatabaseService } from '../../database/database.service.js';
import { ErrorCode } from '../../shared/validation/error-codes.enum.js';
import { MoneyService } from '../../shared/money/money.service.js';
import { BusinessService } from '../business/business.service.js';
import { BookingVisibility } from '../business/enums/booking-visibility.enum.js';
import { StaffService } from '../staff/staff.service.js';
import { TimeService } from '../time/time.service.js';
import { CalendarBookingReader } from './calendar-booking-reader.js';
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
      findFirst: vi.fn(),
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
        { provide: BusinessService, useValue: {} },
        { provide: CalendarBookingReader, useValue: {} },
        { provide: CalendarComputeService, useValue: {} },
        { provide: EventEmitter2, useValue: { emit: vi.fn() } },
      ],
    }).compile();
    service = module.get(CalendarService);
  });

  it('detaches one occurrence as a non-repeating event', async () => {
    db.calendarEvent.findFirst.mockResolvedValue(seriesEvent());
    tx.calendarEvent.create.mockResolvedValue({ id: 'exception-1' });

    await service.update('biz', 'event-1', singleOccurrenceUpdate());

    expect(db.calendarEvent.findFirst).toHaveBeenCalledWith({
      where: { id: 'event-1', businessId: 'biz' },
    });
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

  it('returns 404 when the block belongs to another business', async () => {
    db.calendarEvent.findFirst.mockResolvedValue(null);

    await expect(service.update('other', 'event-1', singleOccurrenceUpdate())).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('CalendarService.moveOccurrence', () => {
  const tx = {
    calendarEventCancelledOccurrence: { upsert: vi.fn() },
    calendarEvent: { create: vi.fn() },
  };
  const db = {
    calendarEvent: {
      findFirst: vi.fn(),
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
        { provide: BusinessService, useValue: {} },
        { provide: CalendarBookingReader, useValue: {} },
        { provide: CalendarComputeService, useValue: {} },
        { provide: EventEmitter2, useValue: { emit: vi.fn() } },
      ],
    }).compile();
    service = module.get(CalendarService);
  });

  it('shifts the whole series without touching the other fields', async () => {
    db.calendarEvent.findFirst.mockResolvedValue(seriesEvent());
    db.calendarEvent.update.mockResolvedValue({ id: 'event-1' });

    await service.moveOccurrence('biz', 'event-1', {
      thisOnly: false,
      startDateTime: '2026-10-02T11:00:00',
      endDateTime: '2026-10-02T12:00:00',
    });

    expect(db.calendarEvent.update).toHaveBeenCalledWith({
      where: { id: 'event-1' },
      data: {
        startDateTime: new Date('2026-10-02T11:00:00'),
        endDateTime: new Date('2026-10-02T12:00:00'),
      },
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('detaches one occurrence and keeps the stored title, reason, and notes', async () => {
    db.calendarEvent.findFirst.mockResolvedValue({ ...seriesEvent(), reason: 'перерыв', notes: 'кухня' });
    tx.calendarEvent.create.mockResolvedValue({ id: 'exception-1' });

    await service.moveOccurrence('biz', 'event-1', {
      thisOnly: true,
      occurrenceDate: '2026-10-08',
      startDateTime: '2026-10-08T11:00:00',
      endDateTime: '2026-10-08T12:00:00',
    });

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
      data: {
        businessId: 'biz',
        staffId: 'staff-1',
        type: CalendarEventType.BLOCK,
        reason: 'перерыв',
        title: 'Обед',
        notes: 'кухня',
        repeatType: CalendarEventRepeatType.NONE,
        startDateTime: new Date('2026-10-08T11:00:00'),
        endDateTime: new Date('2026-10-08T12:00:00'),
        daysMask: null,
        repeatUntil: null,
      },
    });
    expect(db.calendarEvent.update).not.toHaveBeenCalled();
  });

  it('returns 404 when the series belongs to another business', async () => {
    db.calendarEvent.findFirst.mockResolvedValue(null);

    await expect(
      service.moveOccurrence('other', 'event-1', {
        thisOnly: false,
        startDateTime: '2026-10-02T11:00:00',
        endDateTime: '2026-10-02T12:00:00',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('CalendarService.getManualAvailableSlots', () => {
  const db = {
    business: { findUnique: vi.fn() },
    service: { findMany: vi.fn() },
    staffShift: { findMany: vi.fn() },
    calendarEvent: { findMany: vi.fn() },
  };
  const staff = { resolveStaffForService: vi.fn() };
  const bookings = { linkedCalendarEventIdsForBooking: vi.fn() };
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
    db.service.findMany.mockResolvedValue([{ id: 'service-1', durationMinutes: 30, bufferMinutes: 0 }]);
    staff.resolveStaffForService.mockResolvedValue([{ id: 'staff-1' }]);
    db.staffShift.findMany.mockResolvedValue([
      { staffId: 'staff-1', date: new Date('2026-09-28T00:00:00.000Z') },
    ]);
    db.calendarEvent.findMany.mockResolvedValue([]);
    bookings.linkedCalendarEventIdsForBooking.mockResolvedValue([]);
    compute.groupShiftsByStaffDate.mockReturnValue(new Map());
    compute.expandBlockEvents.mockReturnValue(new Map());
    compute.collectSlotsForDate.mockReturnValue([9 * 60]);

    const module = await Test.createTestingModule({
      providers: [
        CalendarService,
        { provide: DatabaseService, useValue: db },
        { provide: StaffService, useValue: staff },
        { provide: BusinessService, useValue: {} },
        { provide: CalendarBookingReader, useValue: bookings },
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

  it('excludes the edited booking calendar events from manual slot blocking', async () => {
    bookings.linkedCalendarEventIdsForBooking.mockResolvedValue(['event-1', 'event-2']);

    await service.getManualAvailableSlots('biz', {
      serviceId: 'service-1',
      from: '2026-09-01',
      to: '2026-09-30',
      bookingId: '28ea07df-62d3-4738-93b3-1560a3517213',
    });

    expect(bookings.linkedCalendarEventIdsForBooking).toHaveBeenCalledWith(
      'biz',
      '28ea07df-62d3-4738-93b3-1560a3517213',
    );
    expect(db.calendarEvent.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        AND: expect.arrayContaining([{ id: { notIn: ['event-1', 'event-2'] } }]),
      }),
      include: { cancelledOccurrences: { select: { occurrenceDate: true } } },
    });
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

describe('CalendarService.getCalendar', () => {
  const db = {
    staffShift: { findMany: vi.fn() },
    calendarEvent: { findMany: vi.fn() },
  };
  const business = { getLocale: vi.fn() };
  const bookings = { listForCalendar: vi.fn() };
  const staff = { namesByIds: vi.fn() };

  let service: CalendarService;

  function oneTime(
    id: string,
    start: string,
    end: string,
    overrides: Partial<CalendarEvent> = {},
  ): CalendarEvent {
    return {
      id,
      businessId: 'biz',
      staffId: null,
      type: CalendarEventType.BLOCK,
      reason: null,
      title: null,
      notes: null,
      repeatType: CalendarEventRepeatType.NONE,
      startDateTime: new Date(start),
      endDateTime: new Date(end),
      daysMask: null,
      repeatUntil: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      cancelledOccurrences: [],
      ...overrides,
    } as CalendarEvent & { cancelledOccurrences: { occurrenceDate: Date }[] };
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    db.staffShift.findMany.mockResolvedValue([]);
    business.getLocale.mockResolvedValue({ timezone: 'Europe/Moscow', currency: 'RUB' });
    bookings.listForCalendar.mockResolvedValue({ bookings: [], linkedEventIds: [] });
    staff.namesByIds.mockResolvedValue(new Map());
    const module = await Test.createTestingModule({
      providers: [
        CalendarService,
        CalendarComputeService,
        { provide: DatabaseService, useValue: db },
        { provide: StaffService, useValue: staff },
        { provide: BusinessService, useValue: business },
        { provide: CalendarBookingReader, useValue: bookings },
        { provide: EventEmitter2, useValue: { emit: vi.fn() } },
      ],
    }).compile();
    service = module.get(CalendarService);
  });

  it('keeps blocks whose interval overlaps the business-local range', async () => {
    db.calendarEvent.findMany.mockResolvedValue([
      oneTime('in-week', '2026-09-22T07:00:00.000Z', '2026-09-22T08:00:00.000Z'),
      oneTime('local-boundary', '2026-09-20T21:30:00.000Z', '2026-09-20T22:00:00.000Z'),
      oneTime('spill', '2026-09-20T20:00:00.000Z', '2026-09-20T21:30:00.000Z', { title: '  ', reason: ' Обед ' }),
      oneTime('outside', '2026-10-02T07:00:00.000Z', '2026-10-02T08:00:00.000Z'),
    ]);

    const result = await service.getCalendar('biz', {
      from: '2026-09-21',
      to: '2026-09-27',
    });

    expect(result.events.map((event) => event.id)).toEqual([
      'in-week:2026-09-22',
      'local-boundary:2026-09-21',
      'spill:2026-09-20',
    ]);
    expect(result.events.map((event) => event.date)).toEqual(['2026-09-22', '2026-09-21', '2026-09-20']);
    expect(result.events[0]).toMatchObject({
      entityId: 'in-week',
      type: CalendarEventType.BLOCK,
      title: 'Событие',
      subtitle: null,
      caption: null,
      editable: true,
      repeating: false,
      staffId: null,
      staffName: null,
    });
    expect(result.events[2]).toMatchObject({ title: 'Обед', startTime: '23:00', endTime: '00:30' });
    expect(bookings.listForCalendar).toHaveBeenCalledWith(
      'biz',
      TimeService.localToUtc('2026-09-21T00:00:00', 'Europe/Moscow'),
      TimeService.localToUtc('2026-09-28T00:00:00', 'Europe/Moscow'),
      undefined,
    );
    expect(db.calendarEvent.findMany).toHaveBeenCalledWith({
      where: {
        businessId: 'biz',
        AND: [
          {
            OR: [
              {
                repeatType: CalendarEventRepeatType.NONE,
                startDateTime: { lte: new Date('2026-09-28T23:59:59.999Z') },
                endDateTime: { gte: new Date('2026-09-20T00:00:00.000Z') },
              },
              {
                repeatType: { not: CalendarEventRepeatType.NONE },
                startDateTime: { lte: new Date('2026-09-28T23:59:59.999Z') },
                OR: [
                  { repeatUntil: null },
                  { repeatUntil: { gte: new Date('2026-09-21T00:00:00.000Z') } },
                ],
              },
            ],
          },
        ],
      },
      include: { cancelledOccurrences: { select: { occurrenceDate: true } } },
    });
  });

  it('expands a weekly block onto each occurrence and names the staff member', async () => {
    db.calendarEvent.findMany.mockResolvedValue([
      oneTime('week', '2026-09-21T06:00:00.000Z', '2026-09-21T07:00:00.000Z', {
        staffId: 'staff-1',
        title: 'Обед',
        repeatType: CalendarEventRepeatType.WEEKLY,
        daysMask: '1111100',
        cancelledOccurrences: [{ occurrenceDate: new Date('2026-09-22') }],
      } as Partial<CalendarEvent>),
    ]);
    staff.namesByIds.mockResolvedValue(new Map([['staff-1', 'Анна']]));

    const result = await service.getCalendar('biz', {
      from: '2026-09-21',
      to: '2026-09-27',
    });

    expect(result.events.map((event) => event.date)).toEqual([
      '2026-09-21',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
    ]);
    expect(result.events[0]).toMatchObject({
      id: 'week:2026-09-21',
      entityId: 'week',
      staffId: 'staff-1',
      staffName: 'Анна',
      title: 'Обед',
      repeating: true,
      editable: true,
      startTime: '09:00',
      endTime: '10:00',
    });
  });

  it('projects a booking once and hides the calendar row that points at it', async () => {
    db.calendarEvent.findMany.mockResolvedValue([
      oneTime('shadow', '2026-09-22T07:00:00.000Z', '2026-09-22T08:00:00.000Z', { staffId: 'staff-1' }),
      oneTime('lunch', '2026-09-22T09:00:00.000Z', '2026-09-22T10:00:00.000Z', { title: 'Обед' }),
    ]);
    bookings.listForCalendar.mockResolvedValue({
      bookings: [{
        id: 'booking-1',
        staffId: 'staff-1',
        staffName: 'Анна',
        clientFirstName: 'Иван',
        clientLastName: 'Петров',
        serviceTitle: 'Стрижка',
        servicePrice: '1500.50',
        customPrice: null,
        startAt: new Date('2026-09-22T07:00:00.000Z'),
        endAt: new Date('2026-09-22T08:00:00.000Z'),
      }],
      linkedEventIds: ['shadow'],
    });

    const result = await service.getCalendar('biz', {
      from: '2026-09-21',
      to: '2026-09-27',
      staffIds: ['staff-1'],
    });

    expect(result.events).toEqual([
      expect.objectContaining({ id: 'lunch:2026-09-22', type: CalendarEventType.BLOCK }),
      {
        id: 'booking-1',
        type: CalendarEventType.BOOKING,
        entityId: 'booking-1',
        staffId: 'staff-1',
        staffName: 'Анна',
        title: 'Стрижка',
        subtitle: 'Петров Иван',
        caption: MoneyService.formatCurrency('1500.50', 'RUB'),
        date: '2026-09-22',
        startTime: '10:00',
        endTime: '11:00',
        editable: false,
        repeating: false,
      },
    ]);
    expect(bookings.listForCalendar).toHaveBeenCalledWith(
      'biz',
      expect.any(Date),
      expect.any(Date),
      ['staff-1'],
    );
  });

  it('drops a cancelled booking and does not show its block', async () => {
    db.calendarEvent.findMany.mockResolvedValue([
      oneTime('shadow', '2026-09-22T07:00:00.000Z', '2026-09-22T08:00:00.000Z'),
    ]);
    bookings.listForCalendar.mockResolvedValue({
      bookings: [],
      linkedEventIds: ['shadow'],
    });

    const result = await service.getCalendar('biz', {
      from: '2026-09-21',
      to: '2026-09-27',
    });

    expect(result.events).toEqual([]);
  });
});
