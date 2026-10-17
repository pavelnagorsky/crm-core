import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { LinePrice } from '../../../shared/money/interfaces/line-price.interface.js';
import { PriceTotals } from '../../../shared/money/interfaces/price-totals.interface.js';
import { priceLine, sumPrices } from '../../../shared/money/line-pricing.js';

@Injectable()
export class OrderPricingCalculator {
  priceLine(
    quantity: Prisma.Decimal,
    listUnitPrice: Prisma.Decimal,
    customUnitPrice: Prisma.Decimal | null,
  ): LinePrice {
    return priceLine(quantity, listUnitPrice, customUnitPrice);
  }

  totals(lines: LinePrice[]): PriceTotals {
    return sumPrices(lines);
  }
}
