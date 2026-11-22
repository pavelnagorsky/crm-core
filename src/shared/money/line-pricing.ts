import { Prisma } from '@prisma/client';
import { LinePrice } from './interfaces/line-price.interface.js';
import { PriceTotals } from './interfaces/price-totals.interface.js';
import { MoneyUtils } from './money.utils.js';

/**
 * Money of one sale line. `lineDiscount` is the discount of the whole line (a promotion
 * from PricingFacade); a custom price replaces the total, so the discount then does not apply.
 * lineTotal = lineSubtotal - discountTotal.
 */
export function priceLine(
  quantity: Prisma.Decimal,
  listUnitPrice: Prisma.Decimal,
  customUnitPrice: Prisma.Decimal | null,
  lineDiscount: Prisma.Decimal = new Prisma.Decimal(0),
): LinePrice {
  const unitPrice = customUnitPrice ?? listUnitPrice;
  const lineSubtotal = MoneyUtils.quantize(quantity.mul(unitPrice));
  const discountTotal =
    customUnitPrice === null
      ? MoneyUtils.quantize(lineDiscount)
      : new Prisma.Decimal(0);
  return {
    listUnitPrice,
    listLineTotal: MoneyUtils.quantize(quantity.mul(listUnitPrice)),
    customUnitPrice,
    unitPrice,
    lineSubtotal,
    discountTotal,
    lineTotal: lineSubtotal.minus(discountTotal),
  };
}

export function sumPrices(lines: LinePrice[]): PriceTotals {
  return lines.reduce<PriceTotals>(
    (totals, line) => ({
      listTotalAmount: totals.listTotalAmount.plus(line.listLineTotal),
      subtotalAmount: totals.subtotalAmount.plus(line.lineSubtotal),
      discountTotal: totals.discountTotal.plus(line.discountTotal),
      totalAmount: totals.totalAmount.plus(line.lineTotal),
    }),
    {
      listTotalAmount: new Prisma.Decimal(0),
      subtotalAmount: new Prisma.Decimal(0),
      discountTotal: new Prisma.Decimal(0),
      totalAmount: new Prisma.Decimal(0),
    },
  );
}
