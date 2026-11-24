import { Prisma } from '@prisma/client';
import { PublicAvailableSlotsDayDto } from './public-available-slots-day.dto.js';

describe('PublicAvailableSlotsDayDto', () => {
  it('maps a priced day to time, a two-digit price, the old price of a promotion and the assigned staff', () => {
    const dto = PublicAvailableSlotsDayDto.fromResult({
      date: '2026-11-10',
      slots: [
        {
          time: '10:00',
          price: new Prisma.Decimal('60'),
          listPrice: new Prisma.Decimal('75'),
          promotionId: 'promo',
          staffIds: ['anna'],
        },
        {
          time: '10:30',
          price: new Prisma.Decimal('49.9'),
          listPrice: null,
          promotionId: null,
          staffIds: ['boris', 'carl'],
        },
      ],
    });

    expect(dto).toEqual({
      date: '2026-11-10',
      slots: [
        // A shown promotion: the old price and the promotion; none: neither field.
        {
          time: '10:00',
          price: '60.00',
          listPrice: '75.00',
          promotionId: 'promo',
          staffIds: ['anna'],
        },
        { time: '10:30', price: '49.90', staffIds: ['boris', 'carl'] },
      ],
    });
  });
});
