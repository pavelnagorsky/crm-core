import { Prisma } from '@prisma/client';

/**
 * Part of a sold product line that a return takes back. With a LIST commission base the earning's
 * base is not the line total, so the reversal takes the same share of the earning's base.
 */
export interface ProductReturnShare {
  /** Quantity of the sold line. */
  lineQuantity: Prisma.Decimal;
  /** Line total of the sold line. */
  lineTotal: Prisma.Decimal;
  /** Quantity of the line returned by earlier posted returns. */
  returnedQuantity: Prisma.Decimal;
  /** Quantity this return takes back. */
  quantity: Prisma.Decimal;
}
