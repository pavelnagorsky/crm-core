import { ConfigService } from '@nestjs/config';
import { AccessInvitationNotification } from '../messages/access-invitation.notification.js';
import { NotificationsService } from './notifications.service.js';

describe('Explicit email delivery', () => {
  const email = { send: vi.fn() };
  const createService = (enabled = true) =>
    new NotificationsService(
      email as never,
      new ConfigService({ notificationsConfig: { enabled } }),
    );
  const notification = new AccessInvitationNotification(
    'member@example.com',
    'https://crm.example/invitation#token=token',
    'Brand',
  );

  beforeEach(() => vi.resetAllMocks());

  it('waits for the email provider to accept the message', async () => {
    let accept!: () => void;
    email.send.mockReturnValue(
      new Promise<void>((resolve) => {
        accept = resolve;
      }),
    );
    let completed = false;
    const sending = createService()
      .sendEmail(notification)
      .then(() => {
        completed = true;
      });
    await Promise.resolve();
    expect(completed).toBe(false);
    accept();
    await sending;
    expect(completed).toBe(true);
    expect(email.send).toHaveBeenCalledExactlyOnceWith(notification);
  });

  it('reports delivery failure instead of returning success', async () => {
    email.send.mockRejectedValue(new Error('SMTP rejected message'));
    await expect(createService().sendEmail(notification)).rejects.toMatchObject(
      { status: 502, errorCode: 'EMAIL_DELIVERY_FAILED' },
    );
  });

  it('reports disabled email delivery without contacting SMTP', async () => {
    await expect(
      createService(false).sendEmail(notification),
    ).rejects.toMatchObject({
      status: 503,
      errorCode: 'EMAIL_DELIVERY_FAILED',
    });
    expect(email.send).not.toHaveBeenCalled();
  });
});
