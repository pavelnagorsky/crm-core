import { Prisma } from '@prisma/client';
import { PaymentChangeKind } from '../enums/payment-change-kind.enum.js';
import { PaymentOperationWithPayments } from './payment-operation-with-payments.interface.js';

/** What a journal write did, for the audit published after commit. */
export interface PaymentChange {
  kind: PaymentChangeKind;
  locationId: string;
  orderId: string;
  currency: string;
  /** The new operation, or the voided one with the records it had before the void. */
  operation: PaymentOperationWithPayments;
  /** The payment a replacement voided, with its records before the void. */
  previous: PaymentOperationWithPayments | null;
  amountDue: Prisma.Decimal | null;
  reason: string | null;
}
