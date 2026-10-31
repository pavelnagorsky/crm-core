import {
  BookingExecutionMode,
  CalendarEventRepeatType,
  CalendarEventType,
  Prisma,
} from '@prisma/client';
import { CalendarCalculator } from '../calendar/calculators/calendar.calculator.js';
import { CalendarEventWithCancellations } from '../calendar/interfaces/calendar-types.interface.js';
import { CalendarAvailabilityService } from '../calendar/services/availability/calendar-availability.service.js';
import { BookingCalendarEventService } from '../calendar/services/events/booking-calendar-event.service.js';
import { AuditActorRole } from '../audit/enums/audit-actor-role.enum.js';
import { BookingCreateFacade } from './booking-create.facade.js';
import { BookingSelectionService } from './services/booking-selection.service.js';
import { BookingSchedulingService } from './services/booking-scheduling.service.js';
import { BookingReservationService } from './services/booking-reservation.service.js';
import { BookingSlotLockService } from './services/booking-slot-lock.service.js';
import { BookingSetupService } from './services/setup/booking-setup.service.js';
import { StaffSelectionMode } from './enums/staff-selection-mode.enum.js';
import { BookingCalendarReadService } from './services/read/booking-calendar-read.service.js';

function setup() {
  const services = [
    {
      id: 'a',
      title: 'A',
      durationMinutes: 60,
      bufferMinutes: 10,
      price: new Prisma.Decimal(60),
    },
    {
      id: 'b',
      title: 'B',
      durationMinutes: 90,
      bufferMinutes: 0,
      price: new Prisma.Decimal(90),
    },
  ];
  const bundle = {
    id: 'bundle',
    title: 'AB',
    executionMode: BookingExecutionMode.PARALLEL,
    pricingMode: 'FIXED',
    fixedPrice: new Prisma.Decimal(120),
    items: services.map((service) => ({ serviceId: service.id, service })),
  };
  const directory = [
    {
      id: 'x',
      name: 'X',
      staffServices: [{ serviceId: 'a' }, { serviceId: 'b' }],
    },
    { id: 'y', name: 'Y', staffServices: [{ serviceId: 'a' }] },
  ];
  const shifts = () =>
    directory.map((member) => ({
      staffId: member.id,
      date: new Date('2026-11-10'),
      startTime: new Date('1970-01-01T09:00:00Z'),
      endTime: new Date('1970-01-01T18:00:00Z'),
    }));
  const staff = {
    listActiveWithServices: vi.fn(async () => directory),
    resolveStaffForService: vi.fn(
      async (_location: string, serviceId: string, id?: string) =>
        directory.filter(
          (member) =>
            (!id || id === member.id) &&
            member.staffServices.some((skill) => skill.serviceId === serviceId),
        ),
    ),
    findById: vi.fn(async (id: string) =>
      directory.find((member) => member.id === id)!,
    ),
    findShiftForDate: vi.fn(async () => ({
      startTime: new Date('1970-01-01T09:00:00Z'),
      endTime: new Date('1970-01-01T18:00:00Z'),
    })),
    listShiftsForAvailability: vi.fn(async () => shifts()),
    listShiftsForStaff: vi.fn(async () => shifts()),
  };
  const blockingEvents: CalendarEventWithCancellations[] = [
    {
      id: 'block-y',
      locationId: 'location',
      staffId: 'y',
      type: CalendarEventType.BLOCK,
      repeatType: CalendarEventRepeatType.NONE,
      startDateTime: new Date('2026-11-10T11:15:00Z'),
      endDateTime: new Date('2026-11-10T18:00:00Z'),
      reason: null,
      title: null,
      notes: null,
      daysMask: null,
      repeatUntil: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      cancelledOccurrences: [],
    },
  ];
  const location = {
    timezone: 'UTC',
    currency: 'BYN',
    brandId: 'brand',
    bookingVisibility: 'PUBLIC',
    advanceBookingWindowDays: 30,
    slotIntervalMinutes: 30,
    minimumBookingNoticeMinutes: 0,
  };
  const locations = {
    findById: vi.fn(async () => location),
    getLocale: vi.fn(async () => location),
    getBookingSettings: vi.fn(async () => location),
    acquireActiveOperationLock: vi.fn(async () => true),
  };
  const catalog = {
    resolveBundleForBooking: vi.fn(async () => bundle),
    resolveBundleForAvailability: vi.fn(async () => bundle),
    loadForBooking: vi.fn(async () => ({ services, bundles: [bundle] })),
  };
  const db = {
    bookingItem: { groupBy: vi.fn(async () => []) },
    calendarEvent: {
      findMany: vi.fn(async () => blockingEvents),
      create: vi.fn(async (args) => ({
        id: `event-${args.data.staffId}`,
        ...args.data,
      })),
    },
    booking: {
      create: vi.fn(async (args) => ({
        id: 'booking',
        ...args.data,
        items: args.data.items.create,
      })),
    },
    $executeRaw: vi.fn(),
    $transaction: vi.fn(async (callback) => callback(db)),
  };
  const availability = new CalendarAvailabilityService(
    db as never,
    staff as never,
    locations as never,
    catalog as never,
    new CalendarCalculator(),
  );
  const calendarEvents = new BookingCalendarEventService(db as never);
  const calendar = {
    filterAvailableStaff: vi.fn(
      availability.filterAvailableStaff.bind(availability),
    ),
    listBlockingEvents: vi.fn(
      calendarEvents.listBlockingEvents.bind(calendarEvents),
    ),
    isSlotFree: vi.fn(availability.isSlotFree.bind(availability)),
    createBookingEvent: vi.fn(
      calendarEvents.createBookingEvent.bind(calendarEvents),
    ),
  };
  const selection = new BookingSelectionService(
    locations as never,
    catalog as never,
    {} as never,
  );
  const scheduling = new BookingSchedulingService(
    db as never,
    staff as never,
    calendar as never,
  );
  const slots = new BookingSlotLockService(staff as never, calendar as never);
  const reservation = new BookingReservationService(
    db as never,
    locations as never,
    calendar as never,
    slots,
    {} as never,
    {} as never,
  );
  const clients = { resolveForBooking: vi.fn() };
  const create = new BookingCreateFacade(
    clients as never,
    {} as never,
    locations as never,
    selection,
    scheduling,
    { created: vi.fn(), notifyCreated: vi.fn() } as never,
    reservation,
  );
  const resolve = new BookingSetupService(
    catalog as never,
    staff as never,
    {} as never,
    locations as never,
    selection,
    scheduling,
  );
  const request = {
    locationId: 'location',
    services,
    startAt: new Date('2026-11-10T10:00:00Z'),
    executionMode: BookingExecutionMode.PARALLEL,
    timezone: 'UTC',
    manualItems: [],
    customEndAt: null,
  };
  return {
    services,
    bundle,
    directory,
    staff,
    calendar,
    db,
    scheduling,
    selection,
    create,
    resolve,
    clients,
    availability,
    blockingEvents,
    location,
    request,
  };
}

describe('Parallel bundle booking', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T00:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('finds the full team in the greedy trap and uses each service interval including its buffer', async () => {
    const { scheduling, request, db, calendar } = setup();
    const items = await scheduling.resolveForBooking(request);
    expect(items.map((item) => [item.serviceId, item.staffId])).toEqual([
      ['a', 'y'],
      ['b', 'x'],
    ]);
    expect(items.map((item) => item.startAt)).toEqual([
      request.startAt,
      request.startAt,
    ]);
    expect(items.map((item) => item.endAt.toISOString())).toEqual([
      '2026-11-10T11:10:00.000Z',
      '2026-11-10T11:30:00.000Z',
    ]);
    expect(calendar.filterAvailableStaff).toHaveBeenCalledTimes(2);
    expect(db.bookingItem.groupBy).toHaveBeenCalledTimes(1);
  });

  it.each(
    [
      [],
      [{ serviceId: 'b', staffId: 'x' }],
      [
        { serviceId: 'b', staffId: 'x' },
        { serviceId: 'a', staffId: null },
      ],
      [
        { serviceId: 'b', staffId: 'x' },
        { serviceId: 'a', staffId: 'y' },
      ],
    ].map((staffAssignments) => ({ staffAssignments })),
  )(
    'resolves automatic, partial and reversed explicit assignments: %j',
    async ({ staffAssignments }) => {
      const { scheduling, request } = setup();
      expect(
        (
          await scheduling.resolveForBooking({ ...request, staffAssignments })
        ).map((item) => item.staffId),
      ).toEqual(['y', 'x']);
    },
  );

  it.each([
    [{ requestedStaffId: 'x' }, 'BOOKING_PARALLEL_STAFF_REQUIRED'],
    [
      { staffAssignments: [{ serviceId: 'other', staffId: 'x' }] },
      'BOOKING_STAFF_ASSIGNMENT_INVALID',
    ],
    [
      { staffAssignments: [{ serviceId: 'a' }, { serviceId: 'a' }] },
      'BOOKING_STAFF_ASSIGNMENT_INVALID',
    ],
    [
      {
        staffAssignments: [
          { serviceId: 'a', staffId: 'x' },
          { serviceId: 'b', staffId: 'x' },
        ],
      },
      'BOOKING_STAFF_ASSIGNMENT_OVERLAP',
    ],
    [
      { staffAssignments: [{ serviceId: 'b', staffId: 'y' }] },
      'BOOKING_STAFF_NOT_FOUND',
    ],
    [
      { staffAssignments: [{ serviceId: 'a', staffId: 'other-location' }] },
      'BOOKING_STAFF_NOT_FOUND',
    ],
  ])('rejects invalid constraints %j', async (constraint, code) => {
    const { scheduling, request } = setup();
    await expect(
      scheduling.resolveForBooking({ ...request, ...constraint }),
    ).rejects.toMatchObject({ errorCode: code });
  });

  it('offers a slot and creates a single fixed-price booking with two events and the previewed team', async () => {
    const { availability, resolve, create, db, calendar, clients } = setup();
    const days = await availability.getManualAvailableSlots('location', {
      bundleId: 'bundle',
      from: '2026-11-10',
      to: '2026-11-10',
    });
    expect(days[0].slots).toContainEqual({ time: '10:00' });
    const preview = await resolve.resolveBookingSelection('location', {
      bundleId: 'bundle',
      startAt: '2026-11-10T10:00:00',
    });
    expect(preview.staffSelection).toBe(StaffSelectionMode.PER_SERVICE);
    expect(preview.canAssignStaff).toBe(true);
    expect(
      preview.staffByService.map((item) => item.availableStaff.length),
    ).toEqual([2, 1]);
    expect(clients.resolveForBooking).not.toHaveBeenCalled();
    const result = await create.createManualBooking(
      'location',
      {
        bundleId: 'bundle',
        startAt: '2026-11-10T10:00:00',
        anonymous: true,
        firstName: '',
        phone: '',
        staffAssignments: preview.resolvedItems.map(
          ({ serviceId, staffId }) => ({ serviceId, staffId }),
        ),
      },
      { name: 'Admin', role: AuditActorRole.OWNER },
    );
    expect(db.booking.create).toHaveBeenCalledTimes(1);
    expect(calendar.createBookingEvent).toHaveBeenCalledTimes(2);
    expect(result.bundleId).toBe('bundle');
    expect(result.executionMode).toBe(BookingExecutionMode.PARALLEL);
    expect(result.items.map((item) => item.chargedPrice.toString())).toEqual([
      '48',
      '72',
    ]);
    expect(result.items.map((item) => item.staffId)).toEqual(['y', 'x']);
    expect(result.endAt.toISOString()).toBe('2026-11-10T11:30:00.000Z');
    expect(
      db.calendarEvent.create.mock.calls.map(([args]) => args.data),
    ).toEqual(
      preview.resolvedItems.map((item) => ({
        locationId: 'location',
        staffId: item.staffId,
        type: CalendarEventType.BOOKING,
        repeatType: CalendarEventRepeatType.NONE,
        startDateTime: item.startAt,
        endDateTime: item.endAt,
      })),
    );
    const read = new BookingCalendarReadService({
      bookingItem: {
        findMany: vi.fn(async () =>
          result.items.map((item, index) => ({
            ...item,
            id: `item-${index}`,
            booking: result,
          })),
        ),
      },
    } as never);
    const feed = await read.listForCalendar(
      'location',
      result.startAt,
      result.endAt,
    );
    expect(feed.linkedEventIds).toEqual(['event-y', 'event-x']);
    expect(
      feed.bookings.map((card) => ({
        entityId: card.entityId,
        staffId: card.staffId,
        price: card.price,
        startAt: card.startAt,
        endAt: card.endAt,
      })),
    ).toEqual(
      result.items.map((item) => ({
        entityId: result.id,
        staffId: item.staffId,
        price: item.chargedPrice.toFixed(2),
        startAt: item.startAt,
        endAt: item.endAt,
      })),
    );
  });

  it('returns no slots without a complete team even when one master knows both services', async () => {
    const { availability, directory, scheduling, request, resolve } = setup();
    directory.pop();
    expect(
      await availability.getManualAvailableSlots('location', {
        bundleId: 'bundle',
        from: '2026-11-10',
        to: '2026-11-10',
      }),
    ).toEqual([]);
    expect(
      (
        await resolve.resolveBookingSelection('location', {
          bundleId: 'bundle',
        })
      ).canAssignStaff,
    ).toBe(false);
    await expect(scheduling.resolveForBooking(request)).rejects.toMatchObject({
      errorCode: 'BOOKING_NO_STAFF_AVAILABLE',
    });
  });

  it.each(
    ['UTC', 'Europe/Minsk'].flatMap((timezone) => [
      { timezone, staffAssignments: [] },
      { timezone, staffAssignments: [{ serviceId: 'b', staffId: 'x' }] },
      {
        timezone,
        staffAssignments: [
          { serviceId: 'a', staffId: 'y' },
          { serviceId: 'b', staffId: 'x' },
        ],
      },
    ]),
  )(
    'agrees on public slots, manual slots and every preview: %j',
    async ({ timezone, staffAssignments }) => {
      const { availability, resolve, location } = setup();
      location.timezone = timezone;
      const selection = { bundleId: 'bundle', staffAssignments };
      const days = await availability.getManualAvailableSlots('location', {
        ...selection,
        from: '2026-11-10',
        to: '2026-11-10',
      });
      expect(days.length).toBe(1);
      expect(
        await availability.getAvailableSlots('location', selection),
      ).toEqual(days);
      for (const { time } of days[0].slots) {
        const preview = await resolve.resolveBookingSelection('location', {
          ...selection,
          startAt: `2026-11-10T${time}:00`,
        });
        expect(preview.resolvedItems.map((item) => item.staffId)).toEqual([
          'y',
          'x',
        ]);
        expect(
          preview.resolvedItems.map(
            (item) => (item.endAt.getTime() - item.startAt.getTime()) / 60000,
          ),
        ).toEqual([70, 90]);
      }
    },
  );

  it.each([
    { blockedFrom: '11:10', available: true },
    { blockedFrom: '11:09', available: false },
  ])(
    'respects the service buffer and exact block boundary: %j',
    async ({ blockedFrom, available }) => {
      const { availability, resolve, blockingEvents } = setup();
      blockingEvents[0].startDateTime = new Date(
        `2026-11-10T${blockedFrom}:00Z`,
      );
      const days = await availability.getManualAvailableSlots('location', {
        bundleId: 'bundle',
        from: '2026-11-10',
        to: '2026-11-10',
      });
      expect(days[0].slots.some((slot) => slot.time === '10:00')).toBe(
        available,
      );
      const preview = resolve.resolveBookingSelection('location', {
        bundleId: 'bundle',
        startAt: '2026-11-10T10:00:00',
      });
      if (available)
        await expect(preview).resolves.toMatchObject({ canAssignStaff: true });
      else
        await expect(preview).rejects.toMatchObject({
          errorCode: 'BOOKING_NO_STAFF_AVAILABLE',
        });
    },
  );

  it('applies a location-wide block to the entire team in slots and preview', async () => {
    const { availability, resolve, blockingEvents } = setup();
    blockingEvents[0].staffId = null;
    blockingEvents[0].startDateTime = new Date('2026-11-10T09:00:00Z');
    expect(
      await availability.getManualAvailableSlots('location', {
        bundleId: 'bundle',
        from: '2026-11-10',
        to: '2026-11-10',
      }),
    ).toEqual([]);
    await expect(
      resolve.resolveBookingSelection('location', {
        bundleId: 'bundle',
        startAt: '2026-11-10T10:00:00',
      }),
    ).rejects.toMatchObject({ errorCode: 'BOOKING_NO_STAFF_AVAILABLE' });
  });

  it('fails the transactional re-check after a preview without writing events or a booking', async () => {
    const { resolve, create, calendar, db, blockingEvents } = setup();
    const preview = await resolve.resolveBookingSelection('location', {
      bundleId: 'bundle',
      startAt: '2026-11-10T10:00:00',
    });
    db.$transaction.mockImplementationOnce(async (callback) => {
      blockingEvents.push({
        ...blockingEvents[0],
        id: 'concurrent-booking',
        staffId: 'x',
        type: CalendarEventType.BOOKING,
        startDateTime: new Date('2026-11-10T10:00:00Z'),
        endDateTime: new Date('2026-11-10T11:00:00Z'),
      });
      return callback(db);
    });
    await expect(
      create.createManualBooking(
        'location',
        {
          bundleId: 'bundle',
          startAt: '2026-11-10T10:00:00',
          anonymous: true,
          firstName: '',
          phone: '',
          staffAssignments: preview.resolvedItems.map(
            ({ serviceId, staffId }) => ({ serviceId, staffId }),
          ),
        },
        { name: 'Admin', role: AuditActorRole.OWNER },
      ),
    ).rejects.toMatchObject({
      errorCode: 'BOOKING_SLOT_UNAVAILABLE',
      status: 409,
    });
    expect(calendar.createBookingEvent).not.toHaveBeenCalled();
    expect(db.booking.create).not.toHaveBeenCalled();
  });

  it('preserves bundle price protection and legacy manual staff choices', async () => {
    const { selection, scheduling, request } = setup();
    await expect(
      selection.resolveForBooking('location', {
        bundleId: 'bundle',
        items: [{ serviceId: 'a', customPrice: '1' }],
      }),
    ).rejects.toMatchObject({ errorCode: 'BOOKING_SELECTION_CONFLICT' });
    const items = await scheduling.resolveForBooking({
      ...request,
      manualItems: [
        { serviceId: 'a', staffId: 'y' },
        { serviceId: 'b', staffId: 'x' },
      ],
    });
    expect(items.map((item) => item.staffId)).toEqual(['y', 'x']);
    await expect(
      scheduling.resolveForBooking({
        ...request,
        manualItems: [{ serviceId: 'a', staffId: 'y' }],
        staffAssignments: [{ serviceId: 'a', staffId: 'x' }],
      }),
    ).rejects.toMatchObject({ errorCode: 'BOOKING_STAFF_ASSIGNMENT_CONFLICT' });
  });

  it('keeps the manual parallel end and still requires distinct staff', async () => {
    const { scheduling, request } = setup();
    const customEndAt = new Date('2026-11-10T11:00:00Z');
    const items = await scheduling.resolveForBooking({
      ...request,
      customEndAt,
    });
    expect(items.map((item) => item.endAt)).toEqual([customEndAt, customEndAt]);
    expect(new Set(items.map((item) => item.staffId)).size).toBe(2);
  });

  it('preserves separate legacy item assignments when the same service is booked twice', async () => {
    const { scheduling, request } = setup();
    const items = await scheduling.resolveForBooking({
      ...request,
      services: [request.services[0], request.services[0]],
      manualItems: [
        { serviceId: 'a', staffId: 'x' },
        { serviceId: 'a', staffId: 'y' },
      ],
    });
    expect(items.map((item) => item.staffId)).toEqual(['x', 'y']);
  });

  it('keeps the less-loaded available staff preferences when a full team can use them', async () => {
    const { scheduling, request, directory, db } = setup();
    directory.push({ id: 'z', name: 'Z', staffServices: [{ serviceId: 'b' }] });
    db.bookingItem.groupBy.mockResolvedValue([
      { staffId: 'y', _count: { id: 100 } },
      { staffId: 'z', _count: { id: 1 } },
    ] as never);
    expect(
      (await scheduling.resolveForBooking(request)).map((item) => item.staffId),
    ).toEqual(['x', 'z']);
  });
});
