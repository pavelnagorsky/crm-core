import { ConfigService } from '@nestjs/config';
import Handlebars from 'handlebars';
import { EmailRenderer } from './email.renderer.js';

describe('EmailRenderer', () => {
  const renderer = new EmailRenderer(
    new ConfigService({ app: { locale: 'ru' } }),
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
    const email = renderer.render('staff-booking-event', {
      ...visit,
      variant: 'REQUESTED',
    });
    expect(email.subject).toBe(
      'Салон — Новая заявка на сб, 14 ноября в 15:00 — подтвердите',
    );
    expect(email.html).toContain('<h1>Новая заявка на запись</h1>');
    expect(email.html).toContain('+375291112233');
    expect(email.html).toContain(`href="${visit.bookingUrl}"`);
    expect(email.html).toContain('суббота, 14 ноября в 15:00');
  });

  it('shows the old time of a move and the year of a visit next year', () => {
    const email = renderer.render('staff-booking-event', {
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
    const email = renderer.render('staff-booking-event', {
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
        const email = renderer.render('booking-reminder', {
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
      const email = renderer.render('booking-status-changed', {
        ...client,
        status: 'RESCHEDULED',
        variant: 'RESCHEDULED',
        previousStartAt: new Date('2026-11-13T09:00:00Z'),
        cancellationReason: null,
      });
      expect(email.subject).toBe(
        'Салон — Запись перенесена на сб, 14 ноября в 15:00',
      );
      expect(email.html).toContain('<h1>Запись перенесена</h1>');
      expect(email.html).toContain('<s>пятница, 13 ноября в 12:00</s>');
      expect(email.html).toContain(
        `href="${Handlebars.escapeExpression(client.manageLink)}"`,
      );
    });

    it('sends a cancellation with the reason and the salon phone but nothing to manage', () => {
      const email = renderer.render('booking-status-changed', {
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
      expect(email.html).not.toContain('class="btn"');
    });

    it('leaves out the address and phone rows when the location has none', () => {
      const email = renderer.render('booking-confirmed', {
        ...client,
        locationAddress: null,
        locationPhone: null,
      });
      expect(email.subject).toBe(
        'Салон — Запись подтверждена — сб, 14 ноября в 15:00',
      );
      expect(email.html).not.toContain('Адрес');
      expect(email.html).not.toContain('Телефон салона');
    });
  });
});
