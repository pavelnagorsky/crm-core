import { BookingItem } from '@prisma/client';

/** The stored discount choice of a booking item; a null mode is AUTO. */
export type BookingItemDiscountChoice = Pick<
  BookingItem,
  'discountChoice' | 'discountChoiceRuleId'
>;
