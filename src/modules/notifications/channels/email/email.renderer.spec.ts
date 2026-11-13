import { ConfigService } from '@nestjs/config';
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
});
