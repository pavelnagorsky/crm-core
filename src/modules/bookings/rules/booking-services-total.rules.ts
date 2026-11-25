import { BookingItem, Prisma } from '@prisma/client';
import { MoneyUtils } from '../../../shared/money/money.utils.js';

/** What the client pays for the services of a booking: the sum of customPrice ?? chargedPrice. */
export function servicesTotal(
  items: readonly Pick<BookingItem, 'customPrice' | 'chargedPrice'>[],
): Prisma.Decimal {
  return items.reduce(
    (sum, item) => sum.plus(item.customPrice ?? item.chargedPrice),
    MoneyUtils.decimal(0),
  );
}
