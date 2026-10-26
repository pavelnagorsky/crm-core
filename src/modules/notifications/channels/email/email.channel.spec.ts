import { ConfigService } from '@nestjs/config';
import { LocationService } from '../../../location/services/location.service.js';
import { BookingNotificationData } from '../../interfaces/booking-notification-data.interface.js';
import { AccessInvitationNotification } from '../../messages/access-invitation.notification.js';
import { BookingCancelledNotification } from '../../messages/booking-cancelled.notification.js';
import { BookingConfirmedNotification } from '../../messages/booking-confirmed.notification.js';
import { BookingReminderNotification } from '../../messages/booking-reminder.notification.js';
import { BookingStatusChangedNotification } from '../../messages/booking-status-changed.notification.js';
import { ConfirmEmailNotification } from '../../messages/confirm-email.notification.js';
import { ResetPasswordNotification } from '../../messages/reset-password.notification.js';
import { EmailChannel } from './email.channel.js';
import { EmailRenderer } from './email.renderer.js';

const { sendMail } = vi.hoisted(() => ({ sendMail: vi.fn() }));
vi.mock('nodemailer', () => ({
  createTransport: () => ({ sendMail }),
}));

describe('Email branding', () => {
  const config = new ConfigService({
    app: { locale: 'ru' },
    emailConfig: { email: 'mail@klendo.example', emailPw: 'test' },
  });
  const locations = { findPublicProfile: vi.fn() };
  const renderer = new EmailRenderer(config);
  renderer.onModuleInit();
  const channel = new EmailChannel(
    config,
    renderer,
    locations as unknown as LocationService,
  );
  const booking: BookingNotificationData = {
    id: 'booking',
    locationId: 'location',
    clientEmail: 'client@example.com',
    clientFirstName: 'Anna',
    clientLastName: 'Ivanova',
    serviceTitle: 'Haircut',
    staffName: 'Olga',
    startAt: new Date('2026-10-26T10:00:00Z'),
    endAt: new Date('2026-10-26T11:00:00Z'),
    timezone: 'Europe/Moscow',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    sendMail.mockResolvedValue({});
    locations.findPublicProfile.mockResolvedValue({
      brand: {
        name: 'Studio Brand',
        logoFile: { url: 'https://cdn.example.com/brand.png' },
      },
    });
  });

  it.each([
    new ConfirmEmailNotification(
      'user@example.com',
      'https://example.com/confirm',
    ),
    new ResetPasswordNotification('user@example.com', '123456'),
  ])(
    'uses Klendo and an embedded PNG for platform email %s',
    async (notification) => {
      await channel.send(notification);

      const mail = sendMail.mock.calls[0][0];
      expect(mail.from).toEqual({
        name: 'Klendo',
        address: 'mail@klendo.example',
      });
      expect(mail.subject).toMatch(/^Klendo — /);
      expect(mail.html).toContain('src="cid:klendo-logo"');
      expect(mail.html).not.toContain('Powered by Klendo');
      expect(mail.attachments).toEqual([
        expect.objectContaining({
          cid: 'klendo-logo',
          contentType: 'image/png',
        }),
      ]);
      expect(mail.attachments[0].content.subarray(0, 8)).toEqual(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      );
      expect(locations.findPublicProfile).not.toHaveBeenCalled();
    },
  );

  it.each([
    new BookingConfirmedNotification(booking, 'https://example.com/manage'),
    new BookingCancelledNotification(booking, 'Cancelled'),
    new BookingReminderNotification(booking),
    new BookingStatusChangedNotification(booking, 'RESCHEDULED', undefined),
  ])('uses the location brand for client email %s', async (notification) => {
    await channel.send(notification);

    const mail = sendMail.mock.calls[0][0];
    expect(locations.findPublicProfile).toHaveBeenCalledWith('location');
    expect(mail.from).toEqual({
      name: 'Studio Brand',
      address: 'mail@klendo.example',
    });
    expect(mail.subject).toMatch(/^Studio Brand — /);
    expect(mail.html).toContain('src="https://cdn.example.com/brand.png"');
    expect(mail.html).toContain('Powered by Klendo');
    expect(mail.html).not.toContain('cid:klendo-logo');
    expect(mail.attachments).toBeUndefined();
  });

  it('keeps the brand name when a business has no logo', async () => {
    locations.findPublicProfile.mockResolvedValue({
      brand: { name: 'Studio Brand', logoFile: null },
    });
    await channel.send(new BookingReminderNotification(booking));

    const mail = sendMail.mock.calls[0][0];
    expect(mail.html).toContain('>Studio Brand</td>');
    expect(mail.html).not.toContain('<img');
    expect(mail.html).toContain('Powered by Klendo');
  });

  it('uses business branding for employee invitations', async () => {
    await channel.send(
      new AccessInvitationNotification(
        'employee@example.com',
        'https://example.com/invite',
        'Inviting Brand',
        'https://cdn.example.com/inviting-brand.png',
      ),
    );

    const mail = sendMail.mock.calls[0][0];
    expect(mail.from.name).toBe('Inviting Brand');
    expect(mail.subject).toMatch(/^Inviting Brand — /);
    expect(mail.html).toContain('>Inviting Brand</td>');
    expect(mail.html).toContain(
      'src="https://cdn.example.com/inviting-brand.png"',
    );
    expect(mail.html).toContain('Powered by Klendo');
    expect(mail.html).not.toContain('cid:klendo-logo');
    expect(locations.findPublicProfile).not.toHaveBeenCalled();
  });

  it('escapes brand names in HTML and ignores unsafe logo URLs', () => {
    const mail = renderer.render('access-invitation', {
      brandName: '<script>alert(1)</script>',
      brandLogoUrl: 'javascript:alert(1)',
    });
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).not.toContain('<img');
  });

  it('requires business branding rather than showing Klendo as the business', () => {
    expect(() => renderer.render('booking-reminder', {})).toThrow(
      'Brand name required',
    );
  });
});
