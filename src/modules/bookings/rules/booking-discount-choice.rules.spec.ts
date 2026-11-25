import { BookingChannel, Prisma } from '@prisma/client';
import { DiscountChoiceMode } from '../../pricing/engine/enums/discount-choice-mode.enum.js';
import { PromotionChannel } from '../../pricing/engine/enums/promotion-channel.enum.js';
import { ServicePriceAdjustment } from '../../pricing/interfaces/service-price-adjustment.interface.js';
import {
  discountChoiceHeld,
  promotionChannelOf,
  repeatedDiscountChoice,
  storedDiscountChoice,
} from './booking-discount-choice.rules.js';

const layer = (
  kind: 'PROMOTION' | 'CLIENT_DISCOUNT',
  ruleId: string | null,
): ServicePriceAdjustment => ({
  sortOrder: 0,
  kind,
  ruleId,
  title: 'x',
  publicTitle: null,
  valueType: null,
  value: null,
  amount: new Prisma.Decimal('-5.00'),
});

describe('booking discount choice rules', () => {
  it('a staff booking prices as ADMIN, the booking page and widget as ONLINE', () => {
    expect(promotionChannelOf(BookingChannel.MANUAL)).toBe(
      PromotionChannel.ADMIN,
    );
    expect(promotionChannelOf(BookingChannel.PUBLIC_PAGE)).toBe(
      PromotionChannel.ONLINE,
    );
    expect(promotionChannelOf(BookingChannel.WIDGET)).toBe(
      PromotionChannel.ONLINE,
    );
  });

  it('stores AUTO as null and a rule only with RULE', () => {
    const auto = { discountChoice: null, discountChoiceRuleId: null };
    expect(storedDiscountChoice(undefined)).toEqual(auto);
    expect(storedDiscountChoice({ mode: DiscountChoiceMode.AUTO })).toEqual(
      auto,
    );
    expect(
      storedDiscountChoice({ mode: DiscountChoiceMode.RULE, ruleId: 'r' }),
    ).toEqual({ discountChoice: 'RULE', discountChoiceRuleId: 'r' });
    expect(
      storedDiscountChoice({
        mode: DiscountChoiceMode.CLIENT_DISCOUNT,
        ruleId: 'r',
      }),
    ).toEqual({
      discountChoice: 'CLIENT_DISCOUNT',
      discountChoiceRuleId: null,
    });
  });

  it('applies a stored pick again with a fallback; nothing stored or a lost rule is AUTO', () => {
    expect(
      repeatedDiscountChoice({
        discountChoice: null,
        discountChoiceRuleId: null,
      }),
    ).toBeUndefined();
    expect(
      repeatedDiscountChoice({
        discountChoice: 'RULE',
        discountChoiceRuleId: null,
      }),
    ).toBeUndefined();
    expect(
      repeatedDiscountChoice({
        discountChoice: 'RULE',
        discountChoiceRuleId: 'r',
      }),
    ).toEqual({ mode: 'RULE', ruleId: 'r', fallbackToAuto: true });
    expect(
      repeatedDiscountChoice({
        discountChoice: 'NONE',
        discountChoiceRuleId: null,
      }),
    ).toEqual({ mode: 'NONE', ruleId: null, fallbackToAuto: true });
  });

  it('a pick holds when the line got its discount; NONE always; a custom price keeps it', () => {
    const rule = { mode: DiscountChoiceMode.RULE, ruleId: 'r' };
    const line = (discount: ServicePriceAdjustment | null) => ({
      customPrice: null,
      discount,
    });
    expect(discountChoiceHeld(rule, line(layer('PROMOTION', 'r')))).toBe(true);
    expect(discountChoiceHeld(rule, line(layer('PROMOTION', 'other')))).toBe(
      false,
    );
    expect(discountChoiceHeld(rule, line(null))).toBe(false);
    expect(
      discountChoiceHeld(
        { mode: DiscountChoiceMode.CLIENT_DISCOUNT },
        line(layer('CLIENT_DISCOUNT', null)),
      ),
    ).toBe(true);
    expect(
      discountChoiceHeld({ mode: DiscountChoiceMode.NONE }, line(null)),
    ).toBe(true);
    expect(
      discountChoiceHeld(rule, {
        customPrice: new Prisma.Decimal('10.00'),
        discount: null,
      }),
    ).toBe(true);
  });
});
