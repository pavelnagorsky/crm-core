import { Prisma } from '@prisma/client';
import { LinePrice } from './interfaces/line-price.interface.js';
import { PriceTotals } from './interfaces/price-totals.interface.js';
import { MoneyUtils } from './money.utils.js';

export function priceLine(
  quantity: Prisma.Decimal,
  listUnitPrice: Prisma.Decimal,
  customUnitPrice: Prisma.Decimal | null,
): LinePrice {
  const unitPrice = customUnitPrice ?? listUnitPrice;
  const lineSubtotal = MoneyUtils.quantize(quantity.mul(unitPrice));
  return {
    listUnitPrice,
    listLineTotal: MoneyUtils.quantize(quantity.mul(listUnitPrice)),
    customUnitPrice,
    unitPrice,
    lineSubtotal,
    discountTotal: new Prisma.Decimal(0),
    lineTotal: lineSubtotal,
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
