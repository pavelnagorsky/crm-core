import { ConfigService } from '@nestjs/config';
import { AccessInvitationNotification } from '../messages/access-invitation.notification.js';
import { BookingConfirmedNotification } from '../messages/booking-confirmed.notification.js';
import { ConfirmEmailNotification } from '../messages/confirm-email.notification.js';
import { NotificationsService } from './notifications.service.js';

const email = { name: 'email', canHandle: () => true, send: vi.fn() };
const createService = (clientNotificationsEnabled = true) =>
  new NotificationsService(
    email as never,
    new ConfigService({ notificationsConfig: { clientNotificationsEnabled } }),
  );
const invitation = new AccessInvitationNotification(
  'member@example.com',
  'https://crm.example/invitation#token=token',
  'Brand',
);
const clientBooking = new BookingConfirmedNotification(
  {
    locationId: 'location-1',
    clientEmail: 'client@example.com',
    clientFirstName: 'Client',
    serviceTitle: 'Haircut',
    staffName: 'Staff',
    startAt: new Date('2026-11-20T10:00:00Z'),
    endAt: new Date('2026-11-20T11:00:00Z'),
    timezone: 'Europe/Minsk',
  } as never,
  'https://crm.example/booking',
);

beforeEach(() => vi.resetAllMocks());

describe('Explicit email delivery', () => {
  it('waits for the email provider to accept the message', async () => {
    let accept!: () => void;
    email.send.mockReturnValue(
      new Promise<void>((resolve) => {
        accept = resolve;
      }),
    );
    let completed = false;
    const sending = createService()
      .sendEmail(invitation)
      .then(() => {
        completed = true;
      });
    await Promise.resolve();
    expect(completed).toBe(false);
    accept();
    await sending;
    expect(completed).toBe(true);
    expect(email.send).toHaveBeenCalledExactlyOnceWith(invitation);
  });

  it('reports delivery failure instead of returning success', async () => {
    email.send.mockRejectedValue(new Error('SMTP rejected message'));
    await expect(createService().sendEmail(invitation)).rejects.toMatchObject({
      status: 502,
      errorCode: 'EMAIL_DELIVERY_FAILED',
    });
  });

  it('sends account emails while client notifications are disabled', async () => {
    email.send.mockResolvedValue(undefined);
    await createService(false).sendEmail(invitation);
    expect(email.send).toHaveBeenCalledExactlyOnceWith(invitation);
  });

  it('reports muted client email without contacting SMTP', async () => {
    await expect(
      createService(false).sendEmail(clientBooking),
    ).rejects.toMatchObject({
      status: 503,
      errorCode: 'EMAIL_DELIVERY_FAILED',
    });
    expect(email.send).not.toHaveBeenCalled();
  });
});

describe('Event-driven delivery', () => {
  it('always delivers account emails', async () => {
    email.send.mockResolvedValue(undefined);
    const confirm = new ConfirmEmailNotification(
      'owner@example.com',
      'https://crm.example/confirm',
    );
    await createService(false).handle(confirm);
    expect(email.send).toHaveBeenCalledExactlyOnceWith(confirm);
  });

  it('skips client emails while client notifications are disabled', async () => {
    await createService(false).handle(clientBooking);
    expect(email.send).not.toHaveBeenCalled();
  });

  it('delivers client emails when client notifications are enabled', async () => {
    email.send.mockResolvedValue(undefined);
    await createService().handle(clientBooking);
    expect(email.send).toHaveBeenCalledExactlyOnceWith(clientBooking);
  });
});
