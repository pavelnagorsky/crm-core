import { Prisma } from '@prisma/client';
import { BookingItemPrices } from '../interfaces/booking-item-prices.interface.js';

/**
 * Price layers of a booking item priced without staff levels or surcharges: base, staff
 * and list price are the catalog price, the charged price is the list price minus the discount.
 */
export function bookingItemPrices(
  listPrice: string,
  discountTotal = '0.00',
): BookingItemPrices {
  const list = new Prisma.Decimal(listPrice);
  const discount = new Prisma.Decimal(discountTotal);
  return {
    basePrice: list,
    staffPrice: list,
    listPrice: list,
    discountTotal: discount,
    chargedPrice: list.minus(discount),
  };
}
