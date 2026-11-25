import {
  BookingItemPriceAdjustment,
  PriceAdjustmentKind,
  PriceValueType,
  Prisma,
} from '@prisma/client';
import { BookingItemWithAdjustments } from '../interfaces/booking-item-with-adjustments.interface.js';
import { BookingItemResponseDto } from './booking-item-response.dto.js';
import { ClientBookingItemResponseDto } from './client-booking-item-response.dto.js';

const decimal = (value: string) => new Prisma.Decimal(value);

function adjustment(
  sortOrder: number,
  kind: PriceAdjustmentKind,
  amount: string,
  overrides: Partial<BookingItemPriceAdjustment> = {},
): BookingItemPriceAdjustment {
  return {
    id: `adj-${sortOrder}`,
    bookingItemId: 'item-1',
    sortOrder,
    kind,
    ruleId: null,
    title: kind,
    publicTitle: null,
    valueType: null,
    value: null,
    amount: decimal(amount),
    ...overrides,
  };
}

function item(
  priceAdjustments?: BookingItemPriceAdjustment[],
  customPrice: string | null = null,
): BookingItemWithAdjustments {
  return {
    id: 'item-1',
    bookingId: 'booking-1',
    locationId: 'location-1',
    serviceId: 'service-1',
    staffId: 'staff-1',
    sortOrder: 0,
    startAt: new Date('2026-11-23T10:00:00.000Z'),
    endAt: new Date('2026-11-23T11:00:00.000Z'),
    serviceTitle: 'Стрижка',
    serviceDuration: 60,
    basePrice: decimal('50'),
    staffPrice: decimal('50'),
    listPrice: decimal('60'),
    discountTotal: decimal('9'),
    chargedPrice: decimal('51'),
    customPrice: customPrice === null ? null : decimal(customPrice),
    staffName: 'Анна',
    calendarEventId: null,
    discountChoice: null,
    discountChoiceRuleId: null,
    priceAdjustments,
  };
}

const surcharge = adjustment(0, PriceAdjustmentKind.SURCHARGE, '10', {
  ruleId: 'evening',
  title: 'Вечер',
  valueType: PriceValueType.PERCENT,
  value: decimal('20'),
});
const promotion = adjustment(1, PriceAdjustmentKind.PROMOTION, '-9', {
  ruleId: 'happy',
  title: 'Счастливые часы (внутр.)',
  publicTitle: 'Счастливые часы',
  valueType: PriceValueType.PERCENT,
  value: decimal('15'),
});

describe('Booking item price layers in responses', () => {
  it('exposes every layer and the discount', () => {
    const dto = BookingItemResponseDto.fromEntity(item([surcharge, promotion]));
    expect(dto.adjustments).toEqual([
      {
        kind: PriceAdjustmentKind.SURCHARGE,
        ruleId: 'evening',
        title: 'Вечер',
        publicTitle: null,
        valueType: PriceValueType.PERCENT,
        value: '20.00',
        amount: '10.00',
      },
      {
        kind: PriceAdjustmentKind.PROMOTION,
        ruleId: 'happy',
        title: 'Счастливые часы (внутр.)',
        publicTitle: 'Счастливые часы',
        valueType: PriceValueType.PERCENT,
        value: '15.00',
        amount: '-9.00',
      },
    ]);
    expect(dto.discount).toEqual(dto.adjustments[1]);
  });

  it('the client discount is the discount layer too', () => {
    const client = adjustment(0, PriceAdjustmentKind.CLIENT_DISCOUNT, '-6', {
      title: 'Скидка клиента',
      publicTitle: 'Ваша скидка',
    });
    expect(BookingItemResponseDto.fromEntity(item([client])).discount?.kind).toBe(
      PriceAdjustmentKind.CLIENT_DISCOUNT,
    );
  });

  it('shows the stored discount pick; nothing picked is null (AUTO)', () => {
    expect(BookingItemResponseDto.fromEntity(item()).discountChoice).toBeNull();
    expect(
      BookingItemResponseDto.fromEntity({
        ...item(),
        discountChoice: 'RULE',
        discountChoiceRuleId: 'happy',
      }).discountChoice,
    ).toEqual({ mode: 'RULE', ruleId: 'happy' });
    expect(
      BookingItemResponseDto.fromEntity({ ...item(), discountChoice: 'NONE' })
        .discountChoice,
    ).toEqual({ mode: 'NONE', ruleId: null });
  });

  it('an item read without layers has none', () => {
    const dto = BookingItemResponseDto.fromEntity(item());
    expect(dto.adjustments).toEqual([]);
    expect(dto.discount).toBeNull();
  });

  describe('client booking page', () => {
    it('shows a public discount with the old price', () => {
      const dto = ClientBookingItemResponseDto.fromBookingItem(
        item([surcharge, promotion]),
      );
      expect(dto).toMatchObject({
        price: '51.00',
        listPrice: '60.00',
        discount: { title: 'Счастливые часы', amount: '9.00' },
      });
    });

    it('a promotion not shown as one is just a lower price', () => {
      const hidden = { ...promotion, publicTitle: null };
      expect(
        ClientBookingItemResponseDto.fromBookingItem(item([hidden])),
      ).toMatchObject({ price: '51.00', listPrice: null, discount: null });
    });

    it('a custom price shows no discount', () => {
      expect(
        ClientBookingItemResponseDto.fromBookingItem(item([promotion], '45')),
      ).toMatchObject({ price: '45.00', listPrice: null, discount: null });
    });
  });
});
