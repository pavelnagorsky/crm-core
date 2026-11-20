import { EmailAudience, EmailCancelReason } from '@prisma/client';
import { AccessInvitationNotification } from '../messages/access-invitation.notification.js';
import { BookingConfirmedNotification } from '../messages/booking-confirmed.notification.js';
import { ConfirmEmailNotification } from '../messages/confirm-email.notification.js';
import { NotificationsService } from './notifications.service.js';

const outbox = { enqueue: vi.fn() };
const delivery = { isMuted: vi.fn(), sendDirect: vi.fn() };
const log = { findPendingClientIds: vi.fn(), cancel: vi.fn() };
const service = new NotificationsService(
  outbox as never,
  delivery as never,
  log as never,
);
const invitation = new AccessInvitationNotification(
  'member@example.com',
  'https://crm.example/invitation#token=token',
  'Brand',
);
const clientBooking = new BookingConfirmedNotification(
  {
    id: 'booking-1',
    locationId: 'location-1',
    clientEmail: 'client@example.com',
    clientFirstName: 'Client',
    clientLastName: 'Last',
    serviceTitle: 'Haircut',
    staffName: 'Staff',
    startAt: new Date('2026-11-20T10:00:00Z'),
    endAt: new Date('2026-11-20T11:00:00Z'),
    timezone: 'Europe/Minsk',
  },
  'https://crm.example/booking',
);

beforeEach(() => {
  vi.resetAllMocks();
  delivery.isMuted.mockImplementation(
    (audience: EmailAudience) => audience === EmailAudience.CLIENT,
  );
});

describe('NotificationsService', () => {
  it('queues durable emails with what they are about', async () => {
    await service.handle(clientBooking);
    expect(outbox.enqueue).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        template: 'booking-confirmed',
        to: 'client@example.com',
      }),
      {
        audience: EmailAudience.CLIENT,
        reference: {
          locationId: 'location-1',
          bookingId: 'booking-1',
          validUntil: new Date('2026-11-20T10:00:00Z'),
        },
      },
      undefined,
    );
    expect(delivery.sendDirect).not.toHaveBeenCalled();
  });

  it('sends one-time secrets directly so their content is never stored', async () => {
    const confirm = new ConfirmEmailNotification(
      'owner@example.com',
      'https://crm.example/confirm',
    );
    await service.handle(confirm);
    expect(delivery.sendDirect).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ template: 'confirm-email' }),
      { audience: EmailAudience.ACCOUNT, reference: {} },
    );
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it('logs instead of throwing when the email cannot be queued', async () => {
    outbox.enqueue.mockRejectedValue(new Error('database unavailable'));
    await expect(service.handle(clientBooking)).resolves.toBeUndefined();
  });

  it('queues inside the caller transaction', async () => {
    const tx = {};
    await service.enqueue(invitation, tx as never);
    expect(outbox.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'access-invitation' }),
      expect.objectContaining({ audience: EmailAudience.ACCOUNT }),
      tx,
    );
  });

  it('reports a failed interactive send to the caller', async () => {
    delivery.sendDirect.mockResolvedValue({ sent: false });
    await expect(service.sendEmail(invitation)).rejects.toMatchObject({
      status: 502,
      errorCode: 'EMAIL_DELIVERY_FAILED',
    });
  });

  it('refuses an interactive client email while client emails are muted', async () => {
    await expect(service.sendEmail(clientBooking)).rejects.toMatchObject({
      status: 503,
    });
    expect(delivery.sendDirect).not.toHaveBeenCalled();
  });

  it('cancels pending client emails of a changed booking in its transaction', async () => {
    const tx = {};
    log.findPendingClientIds.mockResolvedValue(['m1', 'm2']);
    await service.cancelPendingForBooking('booking-1', tx as never);
    expect(log.findPendingClientIds).toHaveBeenCalledWith('booking-1', tx);
    expect(log.cancel).toHaveBeenCalledWith(
      ['m1', 'm2'],
      EmailCancelReason.BOOKING_CHANGED,
      null,
      tx,
    );
  });
});
