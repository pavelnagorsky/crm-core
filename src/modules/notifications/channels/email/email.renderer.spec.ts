import { ConfigService } from '@nestjs/config';
import Handlebars from 'handlebars';
import { EmailRenderer } from './email.renderer.js';
import { EmailTemplate } from '../../enums/email-template.enum.js';

describe('EmailRenderer', () => {
  const renderer = new EmailRenderer(
    new ConfigService({
      app: { locale: 'ru' },
      frontend: { domain: 'https://klendo.by' },
    }),
  );
  const visit = {
    brandName: 'Салон',
    recipientFirstName: 'Ольга',
    clientName: 'Анна Иванова',
    clientPhone: '+375291112233',
    serviceTitle: 'Стрижка',
    staffName: 'Мария',
    startAt: new Date('2026-11-14T12:00:00Z'),
    endAt: new Date('2026-11-14T13:00:00Z'),
    timezone: 'Europe/Minsk',
    previousStartAt: null,
    cancellationReason: null,
    bookingUrl: 'https://app.example.test/app/locations/loc/bookings/b1',
  };

  beforeAll(() => renderer.onModuleInit());
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-13T09:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('names the event and the visit in the subject of a staff email', () => {
    const email = renderer.render(EmailTemplate.STAFF_BOOKING_EVENT, {
      ...visit,
      variant: 'REQUESTED',
    });
    expect(email.subject).toBe(
      'Салон — Новая заявка на сб, 14 ноября в 15:00 — подтвердите',
    );
    expect(email.html).toContain('>Новая заявка на запись</h1>');
    expect(email.html).toContain('+375291112233');
    expect(email.html).toContain(`href="${visit.bookingUrl}"`);
    expect(email.html).toContain('Суббота, 14 ноября');
    expect(email.html).toContain('15:00 — 16:00');
  });

  it('shows the old time of a move and the year of a visit next year', () => {
    const email = renderer.render(EmailTemplate.STAFF_BOOKING_EVENT, {
      ...visit,
      variant: 'RESCHEDULED',
      startAt: new Date('2027-01-05T12:00:00Z'),
      endAt: new Date('2027-01-05T13:00:00Z'),
      previousStartAt: visit.startAt,
    });
    expect(email.subject).toContain('Клиент перенёс запись на');
    expect(email.html).toContain('<s>суббота, 14 ноября в 15:00</s>');
    expect(email.html).toContain('2027');
  });

  it('greets without a name when the recipient has none', () => {
    const email = renderer.render(EmailTemplate.STAFF_BOOKING_EVENT, {
      ...visit,
      variant: 'CANCELLED',
      recipientFirstName: null,
    });
    expect(email.html).toContain('Здравствуйте!');
  });

  describe('client booking emails', () => {
    const client = {
      brandName: 'Салон',
      clientFirstName: 'Анна',
      serviceTitle: 'Стрижка',
      staffName: 'Мария',
      startAt: new Date('2026-11-14T12:00:00Z'),
      endAt: new Date('2026-11-14T13:00:00Z'),
      timezone: 'Europe/Minsk',
      locationAddress: 'Минск, ул. Ленина, 1',
      locationPhone: '+375291234567',
      manageLink: 'https://example.test/booking/manage#token=t',
    };

    it.each([
      ['TOMORROW', 'Салон — Завтра в 15:00 — ваша запись', 'Ждём вас завтра!'],
      ['TODAY', 'Салон — Сегодня в 15:00 — ваша запись', 'Ждём вас сегодня!'],
    ])(
      'reminds about a visit %s with a way to move or cancel it',
      (variant, subject, body) => {
        const email = renderer.render(EmailTemplate.BOOKING_REMINDER, {
          ...client,
          variant,
        });
        expect(email.subject).toBe(subject);
        expect(email.html).toContain(body);
        expect(email.html).not.toContain('через час');
        expect(email.html).toContain(
          `href="${Handlebars.escapeExpression(client.manageLink)}"`,
        );
        expect(email.html).toContain('Минск, ул. Ленина, 1');
        expect(email.html).toContain('href="tel:+375291234567"');
      },
    );

    it('tells which way a booking moved', () => {
      const email = renderer.render(EmailTemplate.BOOKING_STATUS_CHANGED, {
        ...client,
        status: 'RESCHEDULED',
        variant: 'RESCHEDULED',
        previousStartAt: new Date('2026-11-13T09:00:00Z'),
        cancellationReason: null,
      });
      expect(email.subject).toBe(
        'Салон — Запись перенесена на сб, 14 ноября в 15:00',
      );
      expect(email.html).toContain('>Запись перенесена</h1>');
      expect(email.html).toContain('<s>пятница, 13 ноября в 12:00</s>');
      expect(email.html).toContain(
        `href="${Handlebars.escapeExpression(client.manageLink)}"`,
      );
    });

    it('sends a cancellation with the reason and the salon phone but nothing to manage', () => {
      const email = renderer.render(EmailTemplate.BOOKING_STATUS_CHANGED, {
        ...client,
        status: 'CANCELLED',
        variant: 'CANCELLED',
        previousStartAt: null,
        cancellationReason: 'Мастер заболел',
        manageLink: null,
      });
      expect(email.subject).toBe(
        'Салон — Запись отменена — сб, 14 ноября в 15:00',
      );
      expect(email.html).toContain('Мастер заболел');
      expect(email.html).toContain('+375291234567');
      expect(email.html).not.toContain('Перенести или отменить');
      expect(email.html).toContain('>Позвонить в салон</a>');
    });

    it('leaves out the address and phone rows when the location has none', () => {
      const email = renderer.render(EmailTemplate.BOOKING_CONFIRMED, {
        ...client,
        locationAddress: null,
        locationPhone: null,
      });
      expect(email.subject).toBe(
        'Салон — Запись подтверждена — сб, 14 ноября в 15:00',
      );
      expect(email.html).not.toContain('Адрес');
      expect(email.html).not.toContain('>Телефон</td>');
    });
  });

  describe('billing emails', () => {
    const billing = {
      brandName: 'Салон <Лето>',
      recipientFirstName: 'Ольга',
      timezone: 'Europe/Minsk',
      actionLink: 'https://klendo.by/app/brands/b1/billing',
    };

    it('sends billing emails from Klendo and names the brand in the text', () => {
      const email = renderer.render(EmailTemplate.SUBSCRIPTION_TRIAL_ENDING, {
        ...billing,
        daysLeft: 7,
        planName: 'Мастер',
        suggestedPlan: true,
        lastDay: new Date('2026-12-13T12:00:00Z'),
      });
      expect(email.subject).toBe(
        'Klendo — Пробный период Салон <Лето> закончится через 7 дн.',
      );
      expect(email.html).toContain('Салон &lt;Лето&gt;');
      expect(email.html).not.toContain('Салон <Лето>');
      expect(email.html).toContain('Рекомендуем');
      expect(email.html).toContain('Мастер');
      expect(email.html).toContain('13 декабря');
      expect(email.html).toContain('>Выбрать тариф</a>');
      expect(email.html).toContain(`href="${billing.actionLink}"`);
      expect(email.html).toContain('support@klendo.by');
    });

    it('offers to discuss terms when no standard plan fits', () => {
      const email = renderer.render(EmailTemplate.SUBSCRIPTION_TRIAL_ENDING, {
        ...billing,
        variant: 'DISCUSS',
        daysLeft: 3,
      });
      expect(email.html).toContain('sales@klendo.by');
      expect(email.html).toContain('>Обсудить условия</a>');
    });

    it.each([
      EmailTemplate.SUBSCRIPTION_TRIAL_ENDING,
      EmailTemplate.SUBSCRIPTION_PERIOD_ENDING,
      EmailTemplate.SUBSCRIPTION_ACCESS_ENDED,
      EmailTemplate.SUBSCRIPTION_ACCESS_LIMITED,
    ])('%s with an open request says we will contact', (template) => {
      const email = renderer.render(template, {
        ...billing,
        variant: 'PENDING',
        daysLeft: 1,
        paymentNumber: 'KL-000123',
      });
      expect(email.html).toContain('мы свяжемся с вами');
      expect(email.html).toContain('>Открыть заявку</a>');
      expect(email.html).toContain('KL-000123');
    });

    it('confirms a payment request with the fixed amount and instructions', () => {
      const email = renderer.render(
        EmailTemplate.SUBSCRIPTION_PAYMENT_REQUESTED,
        {
          ...billing,
          paymentNumber: 'KL-000123',
          planName: 'Команда',
          billingPeriod: 'YEAR',
          amount: '590.00 BYN',
          expiresAt: new Date('2026-11-20T12:00:00Z'),
          instructions: 'Реквизиты:\nр/с 123',
        },
      );
      expect(email.subject).toBe('Klendo — Заявка KL-000123 на оплату Klendo');
      expect(email.html).toContain('свяжемся с вами');
      expect(email.html).toContain('590.00 BYN');
      expect(email.html).toContain('Год');
      expect(email.html).toContain('20 ноября');
      expect(email.html).toContain('Реквизиты:\nр/с 123');
      expect(email.html).toContain('sales@klendo.by');
    });

    it('leaves out instructions and empty rows', () => {
      const email = renderer.render(
        EmailTemplate.SUBSCRIPTION_PAYMENT_REQUESTED,
        {
          ...billing,
          paymentNumber: 'KL-000124',
          instructions: null,
        },
      );
      expect(email.html).not.toContain('>Сумма</td>');
      expect(email.html).not.toContain('white-space: pre-line');
    });

    it('names the new last day in the subject of a received payment', () => {
      const email = renderer.render(
        EmailTemplate.SUBSCRIPTION_PAYMENT_RECEIVED,
        {
          ...billing,
          lastDay: new Date('2027-12-13T12:00:00Z'),
          planName: 'Мастер',
          billingPeriod: 'YEAR',
        },
      );
      expect(email.subject).toContain('Оплата получена, Klendo работает до');
      expect(email.subject).toContain('13 декабря');
    });

    it('shows the owner to the admin of a new request', () => {
      const email = renderer.render(
        EmailTemplate.ADMIN_SUBSCRIPTION_PAYMENT_REQUESTED,
        {
          ...billing,
          recipientFirstName: null,
          actionLink:
            'https://klendo.by/admin/billing/payments?search=KL-000123',
          paymentNumber: 'KL-000123',
          ownerEmail: 'owner@example.test',
          comment: 'Позвоните после 18:00',
        },
      );
      expect(email.subject).toBe(
        'Klendo — Новая заявка KL-000123: Салон <Лето>',
      );
      expect(email.html).toContain('owner@example.test');
      expect(email.html).toContain('Позвоните после 18:00');
      expect(email.html).toContain('search&#x3D;KL-000123');
    });
  });
});
