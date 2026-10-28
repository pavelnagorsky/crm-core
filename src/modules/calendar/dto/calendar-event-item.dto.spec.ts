import {
  BookingStatus,
  CalendarEventRepeatType,
  CalendarEventType,
} from '@prisma/client';
import { CalendarEventItemDto } from './calendar-event-item.dto.js';
import { CalendarBookingView } from '../interfaces/calendar-booking-view.interface.js';

function booking(
  overrides: Partial<CalendarBookingView> = {},
): CalendarBookingView {
  return {
    id: 'booking-1',
    entityId: 'booking-1',
    status: BookingStatus.CONFIRMED,
    staffId: 'staff-1',
    staffName: 'Анна',
    clientName: 'Мария Иванова',
    serviceTitles: ['Стрижка'],
    price: '1500.50',
    startAt: new Date('2026-09-22T07:00:00.000Z'),
    endAt: new Date('2026-09-22T08:00:00.000Z'),
    ...overrides,
  };
}

describe('CalendarEventItemDto.booking', () => {
  it('keeps the name empty and puts the service on the second line', () => {
    const item = CalendarEventItemDto.booking(
      booking({ price: '90.00' }),
      'Europe/Moscow',
    );

    expect(item.title).toBeNull();
    expect(item.subtitle).toBe('Стрижка');
    expect(item.price).toBe('90.00');
    expect(item.staffName).toBe('Анна');
    expect(item.clientName).toBe('Мария Иванова');
    expect(item.status).toBe(BookingStatus.CONFIRMED);
  });

  it('joins two services and counts three or more', () => {
    expect(
      CalendarEventItemDto.booking(
        booking({ serviceTitles: ['Стрижка', 'Окрашивание'] }),
        'UTC',
      ).subtitle,
    ).toBe('Стрижка + Окрашивание');
    expect(
      CalendarEventItemDto.booking(
        booking({ serviceTitles: ['Стрижка', 'Окрашивание', 'Укладка'] }),
        'UTC',
      ).subtitle,
    ).toBe('3 услуги');
    expect(
      CalendarEventItemDto.booking(
        booking({ serviceTitles: ['1', '2', '3', '4', '5'] }),
        'UTC',
      ).subtitle,
    ).toBe('5 услуг');
    expect(
      CalendarEventItemDto.booking(
        booking({
          serviceTitles: Array.from({ length: 21 }, (_, index) => `${index}`),
        }),
        'UTC',
      ).subtitle,
    ).toBe('21 услуга');
  });

  it('leaves the subtitle empty when every service title is blank', () => {
    const item = CalendarEventItemDto.booking(
      booking({ serviceTitles: [' ', ''] }),
      'Europe/Moscow',
    );

    expect(item.title).toBeNull();
    expect(item.subtitle).toBeNull();
    expect(item.price).toBe('1500.50');
  });
});

describe('CalendarEventItemDto.block', () => {
  it('uses the title, then the reason, and leaves both empty when neither is set', () => {
    const named = CalendarEventItemDto.block(
      {
        id: 'event-1',
        staffId: null,
        title: '  ',
        reason: ' Обед ',
        repeatType: CalendarEventRepeatType.NONE,
      },
      '2026-09-22',
      '13:00',
      '14:00',
      null,
    );
    const empty = CalendarEventItemDto.block(
      {
        id: 'event-2',
        staffId: null,
        title: null,
        reason: null,
        repeatType: CalendarEventRepeatType.NONE,
      },
      '2026-09-22',
      '13:00',
      '14:00',
      null,
    );

    expect(named).toMatchObject({
      type: CalendarEventType.BLOCK,
      status: null,
      clientName: null,
      title: 'Обед',
      subtitle: null,
      price: null,
    });
    expect(empty.title).toBeNull();
  });
});

describe('CalendarEventItemDto.integration', () => {
  it('keeps only the external title', () => {
    const item = CalendarEventItemDto.integration(
      {
        id: 'event-1',
        staffId: 'staff-1',
        title: ' Созвон ',
        repeatType: CalendarEventRepeatType.NONE,
      },
      '2026-09-22',
      '13:00',
      '14:00',
      'Анна',
    );

    expect(item).toMatchObject({
      type: CalendarEventType.INTEGRATION,
      status: null,
      clientName: null,
      title: 'Созвон',
      subtitle: null,
      price: null,
      staffName: 'Анна',
    });
  });
});
