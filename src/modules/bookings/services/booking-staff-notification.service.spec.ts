import { ConfigService } from '@nestjs/config';
import { StaffBookingEvent } from '../../notifications/enums/staff-booking-event.enum.js';
import { StaffBookingNotification } from '../../notifications/messages/staff-booking.notification.js';
import { NOTIFICATION_EVENT } from '../../notifications/services/notifications.service.js';
import { booking } from '../testing/factories/booking.factory.js';
import { BookingStaffNotificationService } from './booking-staff-notification.service.js';

describe('BookingStaffNotificationService', () => {
  const emitter = { emit: vi.fn() };
  const staff = { findLinkedUserIds: vi.fn() };
  const access = { bookingNotificationRecipients: vi.fn() };
  const locations = { getLocale: vi.fn() };
  const service = new BookingStaffNotificationService(
    emitter as never,
    staff as never,
    access as never,
    locations as never,
    new ConfigService({ frontend: { domain: 'https://app.example.test' } }),
  );
  const visit = booking({
    id: 'b1',
    locationId: 'loc',
    clientFirstName: 'Анна',
    clientLastName: 'Иванова',
    clientPhone: '+375291112233',
  });

  beforeEach(() => {
    vi.resetAllMocks();
    staff.findLinkedUserIds.mockResolvedValue(['staff-user']);
    access.bookingNotificationRecipients.mockResolvedValue([
      { id: 'manager', firstName: 'Ольга', email: 'olga@example.test' },
      { id: 'no-email', firstName: 'Пётр', email: null },
    ]);
    locations.getLocale.mockResolvedValue({ timezone: 'Europe/Minsk' });
  });

  it('emails every recipient with an address, linking the booking in the panel', async () => {
    const previousStartAt = new Date('2026-09-23T10:00:00Z');
    await service.notify(visit, StaffBookingEvent.RESCHEDULED, previousStartAt);

    expect(staff.findLinkedUserIds).toHaveBeenCalledWith('loc', ['anna']);
    expect(access.bookingNotificationRecipients).toHaveBeenCalledWith('loc', [
      'staff-user',
    ]);
    expect(emitter.emit).toHaveBeenCalledOnce();
    const [event, notification] = emitter.emit.mock.calls[0];
    expect(event).toBe(NOTIFICATION_EVENT);
    expect(notification).toBeInstanceOf(StaffBookingNotification);
    expect(notification.toEmail()).toEqual({
      to: 'olga@example.test',
      data: expect.objectContaining({
        variant: StaffBookingEvent.RESCHEDULED,
        recipientFirstName: 'Ольга',
        clientName: 'Анна Иванова',
        clientPhone: '+375291112233',
        timezone: 'Europe/Minsk',
        previousStartAt,
        bookingUrl: 'https://app.example.test/app/locations/loc/bookings/b1',
      }),
    });
  });

  it('sends nothing when nobody should hear about it', async () => {
    access.bookingNotificationRecipients.mockResolvedValue([]);
    await service.notify(visit, StaffBookingEvent.CREATED);
    expect(emitter.emit).not.toHaveBeenCalled();
  });

  it('never fails the client action', async () => {
    staff.findLinkedUserIds.mockRejectedValue(new Error('db down'));
    await expect(
      service.notify(visit, StaffBookingEvent.CANCELLED),
    ).resolves.toBeUndefined();
    expect(emitter.emit).not.toHaveBeenCalled();
  });
});
