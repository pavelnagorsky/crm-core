import { HttpStatus } from '@nestjs/common';
import { CalendarEventRepeatType, CalendarEventType } from '@prisma/client';
import { BookingCreateService } from './booking-create.service.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';
import { BookingVisibility } from '@prisma/client';
import { AuditActorRole } from '../audit/enums/audit-actor-role.enum.js';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { BookingStatus } from './enums/booking-status.enum.js';
import { BookingSource } from './enums/booking-source.enum.js';

const dto: CreateBookingDto = {
  locationId: 'business-1',
  serviceId: 'service-1',
  staffId: 'staff-1',
  startAt: '2026-09-20T10:00:00',
  firstName: 'Анна',
  lastName: 'Иванова',
  phone: '+375291112233',
};

function channelDeps(): [never] {
  return [{ assertAllowed: vi.fn() } as never];
}

function setup() {
  const clients = { resolveForBooking: vi.fn() };
  const staff = {
    resolveStaffForService: vi.fn().mockResolvedValue([]),
    findById: vi.fn(),
  };
  const calendar = { filterAvailableStaff: vi.fn().mockResolvedValue([]) };
  const db = {
    location: {
      findUnique: vi.fn().mockResolvedValue({
        isBookingConfirmationRequired: false,
        timezone: 'Europe/Minsk',
        bookingVisibility: BookingVisibility.PUBLIC,
        currency: 'BYN',
      }),
    },
    service: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'service-1',
          title: 'Стрижка',
          durationMinutes: 60,
          bufferMinutes: 0,
          price: 50,
        },
      ]),
    },
  };
  const service = new BookingCreateService(
    db as never,
    calendar as never,
    clients as never,
    staff as never,
    { emit: vi.fn() } as never,
    { generateClientToken: vi.fn() } as never,
    ...channelDeps(),
  );
  return { service, clients, staff };
}

describe('BookingCreateService client ban', () => {
  it('rejects public booking for a banned phone before looking up staff', async () => {
    const { service, clients, staff } = setup();
    clients.resolveForBooking.mockResolvedValue({
      bannedAt: new Date('2026-09-01T00:00:00.000Z'),
    });

    const error = await service.createPublicBooking('business-1', dto).then(
      () => null,
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).errorCode).toBe('CLIENT_BANNED');
    expect((error as AppException).getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect(staff.resolveStaffForService).not.toHaveBeenCalled();
  });

  it('lets a banned client be booked from the journal', async () => {
    const { service, clients } = setup();
    clients.resolveForBooking.mockResolvedValue({
      bannedAt: new Date('2026-09-01T00:00:00.000Z'),
    });

    const error = await service
      .createManualBooking('business-1', dto, {
        id: 'user-1',
        name: 'Ольга',
        role: AuditActorRole.OWNER,
      })
      .then(
        () => null,
        (caught: unknown) => caught,
      );

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).errorCode).toBe('BOOKING_STAFF_NOT_FOUND');
  });

  it('lets a client who is not banned book online', async () => {
    const { service, clients } = setup();
    clients.resolveForBooking.mockResolvedValue({ bannedAt: null });

    const error = await service.createPublicBooking('business-1', dto).then(
      () => null,
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).errorCode).toBe('BOOKING_STAFF_NOT_FOUND');
  });

  it('passes an empty surname when the guest omits it', async () => {
    const { service, clients } = setup();
    clients.resolveForBooking.mockResolvedValue({
      bannedAt: new Date('2026-09-01T00:00:00.000Z'),
    });

    await service
      .createPublicBooking('business-1', { ...dto, lastName: undefined })
      .then(
        () => null,
        () => null,
      );

    expect(clients.resolveForBooking).toHaveBeenCalledWith(
      'business-1',
      dto.phone,
      dto.firstName,
      '',
      undefined,
    );
  });
});

describe('BookingCreateService calendar link', () => {
  it('creates the linked calendar event as a booking event', async () => {
    const clients = {
      resolveForBooking: vi.fn().mockResolvedValue({
        id: 'client-1',
        firstName: 'Анна',
        lastName: 'Иванова',
        phone: '+375291112233',
        email: null,
        bannedAt: null,
      }),
    };
    const calendar = {
      filterAvailableStaff: vi.fn().mockResolvedValue([{ id: 'staff-1' }]),
      isSlotFree: vi.fn().mockReturnValue(true),
    };
    const staff = {
      resolveStaffForService: vi.fn().mockResolvedValue([{ id: 'staff-1' }]),
      findById: vi.fn().mockResolvedValue({ id: 'staff-1', name: 'Мария' }),
    };
    const tx = {
      $executeRaw: vi.fn(),
      staffShift: {
        findFirst: vi.fn().mockResolvedValue({
          startTime: new Date('1970-01-01T06:00:00.000Z'),
          endTime: new Date('1970-01-01T18:00:00.000Z'),
        }),
      },
      calendarEvent: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: 'event-1' }),
      },
      booking: {
        create: vi.fn().mockResolvedValue({
          id: 'booking-1',
          locationId: 'business-1',
          serviceId: 'service-1',
          staffId: 'staff-1',
          clientId: 'client-1',
          startAt: new Date('2026-09-20T07:00:00.000Z'),
          endAt: new Date('2026-09-20T08:00:00.000Z'),
          status: BookingStatus.CONFIRMED,
          clientFirstName: 'Анна',
          clientLastName: 'Иванова',
          clientPhone: '+375291112233',
          clientEmail: null,
          serviceTitle: 'Стрижка',
          serviceDuration: 60,
          servicePrice: 50,
          customPrice: null,
          staffName: 'Мария',
          calendarEventId: 'event-1',
          items: [
            {
              id: 'booking-item-1',
              bookingId: 'booking-1',
              locationId: 'business-1',
              serviceId: 'service-1',
              staffId: 'staff-1',
              sortOrder: 0,
              startAt: new Date('2026-09-20T07:00:00.000Z'),
              endAt: new Date('2026-09-20T08:00:00.000Z'),
              serviceTitle: 'РЎС‚СЂРёР¶РєР°',
              serviceDuration: 60,
              listPrice: 50,
              chargedPrice: 50,
              customPrice: null,
              staffName: 'РњР°СЂРёСЏ',
              calendarEventId: 'event-1',
            },
          ],
        }),
      },
    };
    const db = {
      location: {
        findUnique: vi.fn().mockResolvedValue({
          isBookingConfirmationRequired: false,
          timezone: 'Europe/Minsk',
          bookingVisibility: BookingVisibility.PUBLIC,
          currency: 'BYN',
        }),
      },
      service: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'service-1',
            title: 'Стрижка',
            durationMinutes: 60,
            bufferMinutes: 0,
            price: 50,
          },
        ]),
      },
      bookingItem: { groupBy: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn((fn: (client: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };

    const service = new BookingCreateService(
      db as never,
      calendar as never,
      clients as never,
      staff as never,
      { emit: vi.fn() } as never,
      { generateClientToken: vi.fn() } as never,
      ...channelDeps(),
    );

    await service.createPublicBooking('business-1', dto);

    expect(tx.calendarEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        locationId: 'business-1',
        staffId: 'staff-1',
        type: CalendarEventType.BOOKING,
        repeatType: CalendarEventRepeatType.NONE,
      }),
    });
    expect(tx.booking.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: BookingSource.PUBLIC_PAGE,
          bookingPageId: null,
          bookingWidgetId: null,
          clientLastName: 'Иванова',
        }),
        include: expect.objectContaining({ items: expect.any(Object) }),
      }),
    );
  });
});

describe('BookingCreateService manual item prices', () => {
  it('stores each item custom price and leaves the others on the catalog price', async () => {
    const clients = {
      resolveForBooking: vi.fn().mockResolvedValue({
        id: 'client-1',
        firstName: 'Анна',
        lastName: 'Иванова',
        phone: '+375291112233',
        email: null,
        bannedAt: null,
      }),
    };
    const calendar = {
      filterAvailableStaff: vi.fn().mockResolvedValue([{ id: 'staff-1' }]),
      isSlotFree: vi.fn().mockReturnValue(true),
    };
    const staff = {
      resolveStaffForService: vi.fn().mockResolvedValue([{ id: 'staff-1' }]),
      findById: vi.fn().mockResolvedValue({ id: 'staff-1', name: 'Мария' }),
    };
    const tx = {
      $executeRaw: vi.fn(),
      staffShift: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ startTime: new Date(), endTime: new Date() }),
      },
      calendarEvent: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: 'event-1' }),
      },
      booking: {
        create: vi.fn().mockResolvedValue({
          id: 'booking-1',
          locationId: 'business-1',
          clientFirstName: 'Анна',
          clientLastName: 'Иванова',
          clientEmail: null,
          startAt: new Date('2026-09-20T07:00:00.000Z'),
          endAt: new Date('2026-09-20T09:00:00.000Z'),
          items: [],
        }),
      },
    };
    const db = {
      location: {
        findUnique: vi.fn().mockResolvedValue({
          isBookingConfirmationRequired: false,
          timezone: 'Europe/Minsk',
          bookingVisibility: BookingVisibility.PUBLIC,
          currency: 'BYN',
        }),
      },
      service: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'service-1',
            title: 'Стрижка',
            durationMinutes: 60,
            bufferMinutes: 0,
            price: 50,
          },
          {
            id: 'service-2',
            title: 'Окрашивание',
            durationMinutes: 60,
            bufferMinutes: 0,
            price: 80,
          },
        ]),
      },
      bookingItem: { groupBy: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn((fn: (client: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };
    const service = new BookingCreateService(
      db as never,
      calendar as never,
      clients as never,
      staff as never,
      { emit: vi.fn() } as never,
      { generateClientToken: vi.fn() } as never,
      ...channelDeps(),
    );

    await service.createManualBooking(
      'business-1',
      {
        ...dto,
        serviceId: undefined,
        items: [
          { serviceId: 'service-1' },
          { serviceId: 'service-2', customPrice: '70.00' },
        ],
      },
      { id: 'user-1', name: 'Ольга', role: AuditActorRole.OWNER },
    );

    const created = tx.booking.create.mock.calls[0][0] as {
      data: { items: { create: { customPrice: string | null }[] } };
    };
    expect(created.data.items.create.map((item) => item.customPrice)).toEqual([
      null,
      '70.00',
    ]);
  });
});
