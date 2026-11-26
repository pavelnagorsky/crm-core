import { DiscountChoiceMode, Prisma } from '@prisma/client';
import { OrderPriceAdjustmentData } from './order-price-adjustment-data.interface.js';

/** Price fields of a product order line and its layers, as stored. */
export interface ProductPriceData {
  fields: {
    baseUnitPrice: Prisma.Decimal;
    listUnitPrice: Prisma.Decimal;
    customUnitPrice: Prisma.Decimal | null;
    unitPrice: Prisma.Decimal;
    lineSubtotal: Prisma.Decimal;
    discountTotal: Prisma.Decimal;
    lineTotal: Prisma.Decimal;
    discountChoice: DiscountChoiceMode | null;
    discountChoiceRuleId: string | null;
  };
  adjustments: OrderPriceAdjustmentData[];
}
