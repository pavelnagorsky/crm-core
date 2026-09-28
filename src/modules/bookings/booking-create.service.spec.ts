import { HttpStatus } from '@nestjs/common';
import { BookingCreateService } from './booking-create.service.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';
import { BookingVisibility } from '../business/enums/booking-visibility.enum.js';
import { AuditActorRole } from '../audit/enums/audit-actor-role.enum.js';
import { AppException } from '../../shared/exceptions/app.exception.js';

const dto: CreateBookingDto = {
  businessId: 'business-1',
  serviceId: 'service-1',
  staffId: 'staff-1',
  startAt: '2026-09-20T10:00:00',
  firstName: 'Анна',
  lastName: 'Иванова',
  phone: '+375291112233',
};

function setup() {
  const clients = { resolveForBooking: vi.fn() };
  const staff = { resolveStaffForService: vi.fn().mockResolvedValue([]), findById: vi.fn() };
  const db = {
    business: {
      findUnique: vi.fn().mockResolvedValue({
        isBookingConfirmationRequired: false,
        timezone: 'Europe/Minsk',
        bookingVisibility: BookingVisibility.PUBLIC,
        currency: 'BYN',
      }),
    },
    service: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'service-1',
        title: 'Стрижка',
        durationMinutes: 60,
        price: 50,
      }),
    },
  };
  const service = new BookingCreateService(
    db as never,
    {} as never,
    clients as never,
    staff as never,
    { emit: vi.fn() } as never,
    { generateClientToken: vi.fn() } as never,
  );
  return { service, clients, staff };
}

describe('BookingCreateService client ban', () => {
  it('rejects public booking for a banned phone before looking up staff', async () => {
    const { service, clients, staff } = setup();
    clients.resolveForBooking.mockResolvedValue({ bannedAt: new Date('2026-09-01T00:00:00.000Z') });

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
    clients.resolveForBooking.mockResolvedValue({ bannedAt: new Date('2026-09-01T00:00:00.000Z') });

    const error = await service.createManualBooking('business-1', dto, {
      id: 'user-1',
      name: 'Ольга',
      role: AuditActorRole.OWNER,
    }).then(
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
});
