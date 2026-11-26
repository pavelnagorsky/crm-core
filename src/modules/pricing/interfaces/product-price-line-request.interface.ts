import { Prisma } from '@prisma/client';

/** One product line to price, in money (PricingFacade.quoteProducts). */
export interface ProductPriceLineRequest {
  productLocationId: string;
  /** Three decimals at most; the facade turns it into thousandths. */
  quantity: Prisma.Decimal;
  customUnitPrice: Prisma.Decimal | null;
  sellerStaffId: string | null;
}
