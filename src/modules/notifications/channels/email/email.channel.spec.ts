import { ConfigService } from '@nestjs/config';
import { LocationService } from '../../../location/services/location.service.js';
import { BookingNotificationData } from '../../interfaces/booking-notification-data.interface.js';
import { AccessInvitationNotification } from '../../messages/access-invitation.notification.js';
import { BookingConfirmedNotification } from '../../messages/booking-confirmed.notification.js';
import { BookingReminderNotification } from '../../messages/booking-reminder.notification.js';
import { BookingStatusChangedNotification } from '../../messages/booking-status-changed.notification.js';
import { ConfirmEmailNotification } from '../../messages/confirm-email.notification.js';
import { ReviewRequestNotification } from '../../messages/review-request.notification.js';
import { ResetPasswordNotification } from '../../messages/reset-password.notification.js';
import { FeedbackForwardedNotification } from '../../messages/feedback-forwarded.notification.js';
import { FeedbackReceivedNotification } from '../../messages/feedback-received.notification.js';
import { SupportRequestForwardedNotification } from '../../messages/support-request-forwarded.notification.js';
import { SupportRequestReceivedNotification } from '../../messages/support-request-received.notification.js';
import { SupportRequestEmailData } from '../../interfaces/support-request-email-data.interface.js';
import { FeedbackEmailData } from '../../interfaces/feedback-email-data.interface.js';
import { EmailChannel } from './email.channel.js';
import { EmailRenderer } from './email.renderer.js';
import { EmailTemplate } from '../../enums/email-template.enum.js';
import { HasEmailChannel } from '../../interfaces/has-email-channel.interface.js';
import { AbstractNotification } from '../../messages/abstract.notification.js';

const { sendMail, createTransport } = vi.hoisted(() => {
  const sendMail = vi.fn();
  return {
    sendMail,
    createTransport: vi.fn((_options: { auth: { user: string } }) => ({
      sendMail,
    })),
  };
});
vi.mock('nodemailer', () => ({ createTransport }));

describe('Email branding', () => {
  const config = new ConfigService({
    app: { locale: 'ru' },
    frontend: { domain: 'https://klendo.by' },
    emailConfig: {
      email: 'mail@klendo.example',
      salesEmail: 'sales@klendo.example',
      supportEmail: 'support@klendo.example',
      emailPw: 'test',
    },
  });
  const locations = { findPublicProfile: vi.fn() };
  const renderer = new EmailRenderer(config);
  renderer.onModuleInit();
  const channel = new EmailChannel(
    config,
    renderer,
    locations as unknown as LocationService,
  );
  const send = async (
    notification: AbstractNotification & HasEmailChannel,
    roundTrip = false,
  ) => {
    const payload = notification.toEmail();
    await channel.transmit(
      await channel.compose({
        template: notification.emailTemplate,
        to: payload.to,
        // What the worker reads back from the delivery log.
        data: roundTrip
          ? JSON.parse(JSON.stringify(payload.data))
          : payload.data,
      }),
    );
  };
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
      await send(notification);

      const mail = sendMail.mock.calls[0][0];
      expect(mail.from).toEqual({
        name: 'Klendo',
        address: 'mail@klendo.example',
      });
      expect(mail.subject).toMatch(/^Klendo - /);
      expect(mail.html).toContain('src="cid:klendo-logo"');
      expect(mail.html).not.toContain(
        'Онлайн-запись работает на <a href="https://klendo.by/"',
      );
      expect(mail.html).toContain(
        '<a href="https://klendo.by/" target="_blank"',
      );
      for (const path of [
        'faqs',
        'contacts',
        'privacy-policy',
        'terms-of-service',
      ])
        expect(mail.html).toContain(`href="https://klendo.by/${path}"`);
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
    new BookingReminderNotification(booking, 'https://example.com/manage'),
    new BookingStatusChangedNotification(booking, 'RESCHEDULED'),
  ])('uses the location brand for client email %s', async (notification) => {
    await send(notification);

    const mail = sendMail.mock.calls[0][0];
    expect(locations.findPublicProfile).toHaveBeenCalledWith('location');
    expect(mail.from).toEqual({
      name: 'Studio Brand',
      address: 'mail@klendo.example',
    });
    expect(mail.subject).toMatch(/^Studio Brand - /);
    expect(mail.html).toContain('src="https://cdn.example.com/brand.png"');
    expect(mail.html).toContain(
      'Онлайн-запись работает на <a href="https://klendo.by/"',
    );
    expect(mail.html).not.toContain('href="https://klendo.by/privacy-policy"');
    expect(mail.html).not.toContain('cid:klendo-logo');
    expect(mail.attachments).toBeUndefined();
  });

  it('keeps the brand name when a business has no logo', async () => {
    locations.findPublicProfile.mockResolvedValue({
      brand: { name: 'Studio Brand', logoFile: null },
    });
    await send(
      new BookingReminderNotification(booking, 'https://example.com/manage'),
    );

    const mail = sendMail.mock.calls[0][0];
    expect(mail.html).toContain('>Studio Brand</td>');
    expect(mail.html).not.toContain('<img');
    expect(mail.html).toContain(
      'Онлайн-запись работает на <a href="https://klendo.by/"',
    );
  });

  it('renders the same email from data read back from the log', async () => {
    const notification = new BookingReminderNotification(
      booking,
      'https://example.com/manage',
    );
    await send(notification);
    await send(notification, true);
    expect(sendMail.mock.calls[1][0].html).toBe(sendMail.mock.calls[0][0].html);
  });

  it('uses business branding for employee invitations', async () => {
    await send(
      new AccessInvitationNotification(
        'employee@example.com',
        'https://example.com/invite',
        'Inviting Brand',
        'https://cdn.example.com/inviting-brand.png',
      ),
    );

    const mail = sendMail.mock.calls[0][0];
    expect(mail.from.name).toBe('Inviting Brand');
    expect(mail.subject).toMatch(/^Inviting Brand - /);
    expect(mail.html).toContain('>Inviting Brand</td>');
    expect(mail.html).toContain(
      'src="https://cdn.example.com/inviting-brand.png"',
    );
    expect(mail.html).toContain(
      'Онлайн-запись работает на <a href="https://klendo.by/"',
    );
    expect(mail.html).not.toContain('cid:klendo-logo');
    expect(locations.findPublicProfile).not.toHaveBeenCalled();
  });

  it('escapes brand names in HTML and ignores unsafe logo URLs', () => {
    const mail = renderer.render(EmailTemplate.ACCESS_INVITATION, {
      brandName: '<script>alert(1)</script>',
      brandLogoUrl: 'javascript:alert(1)',
    });
    expect(mail.html).toContain('&lt;script&gt;');
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).not.toContain('<img');
  });

  it('requires business branding rather than showing Klendo as the business', () => {
    expect(() => renderer.render(EmailTemplate.BOOKING_REMINDER, {})).toThrow(
      'Brand name required',
    );
  });

  it('renders the review request with the management link and visit details', async () => {
    await send(
      new ReviewRequestNotification(booking, 'https://example.com/manage'),
    );
    const mail = sendMail.mock.calls[0][0];
    expect(mail.subject).toBe('Studio Brand - Оцените ваш визит');
    expect(mail.html).toContain('href="https://example.com/manage"');
    expect(mail.html).toContain('Оставить отзыв');
    expect(mail.html).toContain('Haircut');
    expect(mail.html).toContain('Olga');
  });
});

describe('Email senders', () => {
  const config = new ConfigService({
    app: { locale: 'ru' },
    frontend: { domain: 'https://klendo.by' },
    emailConfig: {
      email: 'noreply@klendo.example',
      salesEmail: 'sales@klendo.example',
      supportEmail: 'support@klendo.example',
      emailPw: 'secret',
      smtpHost: 'mail.klendo.example',
      smtpPort: 465,
    },
  });
  const renderer = new EmailRenderer(config);
  renderer.onModuleInit();
  const channel = new EmailChannel(
    config,
    renderer,
    {} as unknown as LocationService,
  );
  const support: SupportRequestEmailData = {
    requestId: 'request-id',
    email: 'author@example.com',
    userName: 'Anna Ivanova',
    message: 'Не работает <b>запись</b>',
    attachmentCount: 2,
    adminLink: 'https://klendo.by/admin/support/request-id/',
  };
  const feedback: FeedbackEmailData = {
    feedbackId: 'feedback-id',
    name: 'Pavel',
    company: 'Studio',
    phone: '+375291234567',
    email: 'lead@example.com',
    message: 'Хочу демо',
    adminLink: 'https://klendo.by/admin/feedback/feedback-id/',
  };
  /** Sends as the queue worker does: the data goes through the log as JSON. */
  const send = async (notification: AbstractNotification & HasEmailChannel) => {
    const payload = notification.toEmail();
    await channel.transmit(
      await channel.compose({
        template: notification.emailTemplate,
        to: payload.to,
        data: JSON.parse(JSON.stringify(payload.data)),
      }),
    );
    return sendMail.mock.calls[sendMail.mock.calls.length - 1][0];
  };

  beforeEach(() => {
    sendMail.mockReset();
    sendMail.mockResolvedValue({});
  });

  it('sends account emails from noreply with Reply-To support', async () => {
    const mail = await send(
      new ResetPasswordNotification('user@example.com', '123456'),
    );
    expect(mail.from).toEqual({
      name: 'Klendo',
      address: 'noreply@klendo.example',
    });
    expect(mail.replyTo).toBe('support@klendo.example');
  });

  it('sends client booking emails from noreply without Reply-To', async () => {
    const reviews = new EmailChannel(config, renderer, {
      findPublicProfile: vi.fn().mockResolvedValue({
        brand: { name: 'Studio Brand', logoFile: null },
      }),
    } as unknown as LocationService);
    const notification = new ReviewRequestNotification(
      {
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
      },
      'https://example.com/manage',
    );
    const payload = notification.toEmail();
    await reviews.transmit(
      await reviews.compose({
        template: notification.emailTemplate,
        ...payload,
      }),
    );
    const mail = sendMail.mock.calls[0][0];
    expect(mail.from.address).toBe('noreply@klendo.example');
    expect(mail).not.toHaveProperty('replyTo');
  });

  it('logs in to SMTP as the sender mailbox, one reused transport per mailbox', async () => {
    const fresh = new EmailChannel(
      config,
      renderer,
      {} as unknown as LocationService,
    );
    const created = createTransport.mock.calls.length;
    const email = { to: 'user@example.com', subject: 's', html: 'h' };
    for (const from of [
      'noreply@klendo.example',
      'sales@klendo.example',
      'noreply@klendo.example',
    ])
      await fresh.transmit({ ...email, from, replyTo: null, senderName: 'K' });
    const logins = createTransport.mock.calls
      .slice(created)
      .map(([options]) => options.auth.user);
    expect(logins).toEqual(['noreply@klendo.example', 'sales@klendo.example']);
    expect(sendMail.mock.calls.map(([mail]) => mail.from.address)).toEqual([
      'noreply@klendo.example',
      'sales@klendo.example',
      'noreply@klendo.example',
    ]);
    expect(createTransport.mock.calls[created][0]).toMatchObject({
      host: 'mail.klendo.example',
      port: 465,
      secure: true,
      auth: { user: 'noreply@klendo.example', pass: 'secret' },
    });
  });

  it('confirms a support request to the author with Reply-To support and the escaped message', async () => {
    const mail = await send(new SupportRequestReceivedNotification(support));
    expect(mail.to).toBe('author@example.com');
    expect(mail.from).toEqual({
      name: 'Klendo',
      address: 'noreply@klendo.example',
    });
    expect(mail.replyTo).toBe('support@klendo.example');
    expect(mail.subject).toMatch(/^Klendo .+ Получили ваше обращение$/);
    expect(mail.html).toContain('Здравствуйте! Поддержка Klendo ответит');
    expect(mail.html).toContain('Не работает &lt;b&gt;запись&lt;/b&gt;');
    expect(mail.html).toContain(
      'Ответьте на это письмо, чтобы дополнить обращение.',
    );
    expect(mail.html).not.toContain('отвечать на него не нужно');
    expect(mail.html).not.toContain('admin/support');
  });

  it('forwards a support request to support with Reply-To the author, kept through the log', async () => {
    const mail = await send(
      new SupportRequestForwardedNotification(
        'support@klendo.example',
        support,
      ),
    );
    expect(mail.to).toBe('support@klendo.example');
    expect(mail.from.address).toBe('noreply@klendo.example');
    expect(mail.replyTo).toBe('author@example.com');
    expect(mail.html).toContain('href="mailto:author@example.com"');
    expect(mail.html).toContain('Anna Ivanova');
    expect(mail.html).toContain('2 файла');
    expect(mail.html).toContain(
      'href="https://klendo.by/admin/support/request-id/"',
    );
    expect(mail.html).toContain('Не работает &lt;b&gt;запись&lt;/b&gt;');
    expect(mail.html).toContain(
      'Письмо отправлено автоматически. Ответ на него уйдёт клиенту.',
    );
  });

  it.each([
    [1, '1 файл'],
    [5, '5 файлов'],
    [21, '21 файл'],
  ])('names %i attachments as "%s"', async (attachmentCount, label) => {
    const mail = await send(
      new SupportRequestForwardedNotification('support@klendo.example', {
        ...support,
        attachmentCount,
      }),
    );
    expect(mail.html).toContain(`>${label}</td>`);
  });

  it('confirms a demo request from sales without Reply-To', async () => {
    const mail = await send(
      new FeedbackReceivedNotification('lead@example.com', feedback),
    );
    expect(mail.to).toBe('lead@example.com');
    expect(mail.from).toEqual({
      name: 'Klendo',
      address: 'sales@klendo.example',
    });
    expect(mail).not.toHaveProperty('replyTo');
    expect(mail.subject).toMatch(/^Klendo .+ Получили вашу заявку на демо$/);
    expect(mail.html).toContain(
      'Здравствуйте, <strong style="font-weight: 600; color: #1C252E;">Pavel</strong>! Скоро свяжемся с вами',
    );
    expect(mail.html).toContain('Хочу демо');
    expect(mail.html).toContain(
      'Письмо отправил отдел продаж Klendo. Ответ на него получит менеджер.',
    );
    expect(mail.html).not.toContain('admin/feedback');
  });

  it('keeps the standard footer on account emails despite Reply-To support', async () => {
    const mail = await send(
      new ResetPasswordNotification('user@example.com', '123456'),
    );
    expect(mail.html).toContain(
      'Письмо отправлено автоматически, отвечать на него не нужно.',
    );
  });

  it('forwards a demo request to sales with the phone link and Reply-To the author', async () => {
    const mail = await send(
      new FeedbackForwardedNotification('sales@klendo.example', feedback),
    );
    expect(mail.to).toBe('sales@klendo.example');
    expect(mail.from.address).toBe('noreply@klendo.example');
    expect(mail.replyTo).toBe('lead@example.com');
    expect(mail.html).toContain('href="tel:+375291234567"');
    expect(mail.html).toContain(
      'href="https://klendo.by/admin/feedback/feedback-id/"',
    );
  });

  it('forwards a phone-only demo request without Reply-To', async () => {
    const mail = await send(
      new FeedbackForwardedNotification('sales@klendo.example', {
        ...feedback,
        email: null,
      }),
    );
    expect(mail).not.toHaveProperty('replyTo');
    expect(mail.html).toContain(
      'Клиент оставил только телефон - позвоните ему.',
    );
  });
});
