import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MoneyService } from '../../../shared/money/money.service.js';
import { OrderLinePrice } from '../interfaces/order-line-price.interface.js';
import { OrderTotals } from '../interfaces/order-totals.interface.js';

@Injectable()
export class OrderComputeService {
  priceLine(
    quantity: Prisma.Decimal,
    listUnitPrice: Prisma.Decimal,
    customUnitPrice: Prisma.Decimal | null,
  ): OrderLinePrice {
    const unitPrice = customUnitPrice ?? listUnitPrice;
    const lineSubtotal = MoneyService.quantize(quantity.mul(unitPrice));
    return {
      listUnitPrice,
      listLineTotal: MoneyService.quantize(quantity.mul(listUnitPrice)),
      customUnitPrice,
      unitPrice,
      lineSubtotal,
      discountTotal: new Prisma.Decimal(0),
      lineTotal: lineSubtotal,
    };
  }

  totals(lines: OrderLinePrice[]): OrderTotals {
    return lines.reduce<OrderTotals>(
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
}
