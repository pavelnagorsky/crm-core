import { Prisma } from '@prisma/client';

/** One service of a bulk fill preview. */
export interface BulkFillItem {
  serviceId: string;
  title: string;
  categoryName: string | null;
  basePrice: Prisma.Decimal;
  currentPrice: Prisma.Decimal | null;
  /** Null when the fill clears the price. */
  newPrice: Prisma.Decimal | null;
  /** The level has no price for the service yet. */
  checked: boolean;
  invalid: boolean;
}
