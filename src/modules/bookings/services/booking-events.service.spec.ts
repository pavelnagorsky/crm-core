import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import Handlebars from 'handlebars';
import { EmailRenderer } from '../../notifications/channels/email/email.renderer.js';
import { BookingStatus } from '../enums/booking-status.enum.js';
import { booking } from '../testing/factories/booking.factory.js';
import { BookingEventsService } from './booking-events.service.js';

describe('Booking creation notifications', () => {
  const emitter = { emit: vi.fn() };
  const tokens = {
    generateClientToken: vi.fn(() => 'token'),
    managementUrl: vi.fn(
      () => 'https://example.test/booking/manage#token=token',
    ),
  };
  const service = new BookingEventsService(
    emitter as never,
    tokens as never,
    {} as never,
    {} as never,
  );
  const renderer = new EmailRenderer(
    new ConfigService({
      app: { locale: 'ru' },
      frontend: { domain: 'https://klendo.by' },
    }),
  );
  beforeAll(() => renderer.onModuleInit());
  beforeEach(() => vi.clearAllMocks());

  it.each([
    [BookingStatus.PENDING, 'booking-pending', 'Заявка принята'],
    [BookingStatus.CONFIRMED, 'booking-confirmed', 'Запись подтверждена'],
  ])(
    'sends the correct email for %s with a management link',
    (status, template, subject) => {
      service.notifyCreated(
        booking({ status, clientEmail: 'client@example.test' }),
        'Europe/Minsk',
      );
      expect(emitter.emit).toHaveBeenCalledTimes(1);
      const notification = emitter.emit.mock.calls[0][1];
      expect(notification.emailTemplate).toBe(template);
      const payload = notification.toEmail();
      expect(payload.to).toBe('client@example.test');
      const email = renderer.render(notification.emailTemplate, {
        ...payload.data,
        brandName: 'Salon',
      });
      expect(email.subject).toContain(subject);
      expect(payload.data.manageLink).toBe(tokens.managementUrl());
      expect(email.html).toContain(
        `href="${Handlebars.escapeExpression(tokens.managementUrl())}"`,
      );
      if (status === BookingStatus.PENDING) {
        expect(email.html).toContain('свяжется с вами, чтобы подтвердить');
        expect(email.html).not.toContain('Ваша запись подтверждена');
      }
    },
  );

  it.each([
    BookingStatus.COMPLETED,
    BookingStatus.CANCELLED,
    BookingStatus.NO_SHOW,
  ])('does not send a creation email for %s', (status) => {
    service.notifyCreated(
      booking({ status, clientEmail: 'client@example.test' }),
      'UTC',
    );
    expect(emitter.emit).not.toHaveBeenCalled();
    expect(tokens.generateClientToken).not.toHaveBeenCalled();
  });

  it('does not generate an email link for a client without email', () => {
    service.notifyCreated(booking(), 'UTC');
    expect(emitter.emit).not.toHaveBeenCalled();
    expect(tokens.generateClientToken).not.toHaveBeenCalled();
  });

  describe('a move email', () => {
    const locale = { timezone: 'Europe/Minsk', currency: 'BYN' };
    // The booking costs 50 after the move.
    const moved = booking({ clientEmail: 'client@example.test' });
    const render = (previousServicesTotal: Prisma.Decimal | null) => {
      const notification = service.statusNotification(
        moved,
        'RESCHEDULED',
        {
          previousStartAt: new Date('2026-09-23T10:00:00Z'),
          previousServicesTotal,
        },
        locale,
      );
      const payload = notification!.toEmail();
      return {
        data: payload.data,
        html: renderer.render(notification!.emailTemplate, {
          ...payload.data,
          brandName: 'Salon',
        }).html,
      };
    };

    it('shows the new price when the move changed it', () => {
      const { data, html } = render(new Prisma.Decimal('51.00'));
      expect(data.priceChange).toEqual({
        price: '50.00 BYN',
        previousPrice: '51.00 BYN',
      });
      expect(html).toContain('Новая цена');
      expect(html).toContain('50.00 BYN');
      expect(html).toContain('(было 51.00 BYN)');
    });

    it('stays as it was when the price did not change or is not known', () => {
      for (const previous of [new Prisma.Decimal('50'), null]) {
        const { data, html } = render(previous);
        expect(data.priceChange).toBeNull();
        expect(html).not.toContain('Новая цена');
      }
    });
  });
});
