import { Prisma } from '@prisma/client';
import { PublicAvailableSlotsDayDto } from './public-available-slots-day.dto.js';

describe('PublicAvailableSlotsDayDto', () => {
  it('maps a priced day to time, a two-digit price and the assigned staff', () => {
    const dto = PublicAvailableSlotsDayDto.fromResult({
      date: '2026-11-10',
      slots: [
        {
          time: '10:00',
          price: new Prisma.Decimal('60'),
          staffIds: ['anna'],
        },
        {
          time: '10:30',
          price: new Prisma.Decimal('49.9'),
          staffIds: ['boris', 'carl'],
        },
      ],
    });

    expect(dto).toEqual({
      date: '2026-11-10',
      slots: [
        { time: '10:00', price: '60.00', staffIds: ['anna'] },
        { time: '10:30', price: '49.90', staffIds: ['boris', 'carl'] },
      ],
    });
  });
});
