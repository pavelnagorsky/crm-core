import { CalendarEventItemDto } from './calendar-event-item.dto.js';
import { MoneyService } from '../../../shared/money/money.service.js';
import { CalendarBookingView } from '../interfaces/calendar-booking-view.interface.js';

function booking(overrides: Partial<CalendarBookingView> = {}): CalendarBookingView {
  return {
    id: 'booking-1',
    staffId: 'staff-1',
    staffName: 'Анна',
    clientFirstName: 'Иван',
    clientLastName: 'Петров',
    serviceTitle: 'Стрижка',
    servicePrice: '1500.50',
    customPrice: null,
    startAt: new Date('2026-09-22T07:00:00.000Z'),
    endAt: new Date('2026-09-22T08:00:00.000Z'),
    ...overrides,
  };
}

describe('CalendarEventItemDto.booking', () => {
  it('puts the service on the first line and the client on the second', () => {
    const item = CalendarEventItemDto.booking(booking({ customPrice: '90.00' }), 'Europe/Moscow', 'RUB');

    expect(item.title).toBe('Стрижка');
    expect(item.subtitle).toBe('Петров Иван');
    expect(item.caption).toBe(MoneyService.formatCurrency('90.00', 'RUB'));
  });

  it('leaves the subtitle empty when the client name is blank', () => {
    const item = CalendarEventItemDto.booking(
      booking({ clientFirstName: ' ', clientLastName: ' ' }),
      'Europe/Moscow',
      'RUB',
    );

    expect(item.title).toBe('Стрижка');
    expect(item.subtitle).toBeNull();
  });

  it('drops the subtitle when it repeats the title', () => {
    const item = CalendarEventItemDto.booking(
      booking({ clientLastName: 'Стрижка', clientFirstName: '', serviceTitle: 'Стрижка' }),
      'UTC',
      'RUB',
    );

    expect(item.title).toBe('Стрижка');
    expect(item.subtitle).toBeNull();
    expect(item.caption).toBe(MoneyService.formatCurrency('1500.50', 'RUB'));
  });
});
