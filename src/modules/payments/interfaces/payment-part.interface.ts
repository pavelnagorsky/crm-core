import { Prisma } from '@prisma/client';
import { PaymentMethod } from '../enums/payment-method.enum.js';

/** One money movement of an operation by one method. */
export interface PaymentPart {
  method: PaymentMethod;
  amount: Prisma.Decimal;
}
