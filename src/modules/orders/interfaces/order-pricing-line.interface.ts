import { OrderItemType, Prisma, ProductUnit } from '@prisma/client';

export interface OrderPricingLine {
  type: OrderItemType;
  catalogItemId: string;
  title: string;
  sku: string | null;
  unit: ProductUnit | null;
  quantity: Prisma.Decimal;
  listUnitPrice: Prisma.Decimal;
  listLineTotal: Prisma.Decimal;
  customUnitPrice: Prisma.Decimal | null;
  unitPrice: Prisma.Decimal;
  lineSubtotal: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
}
