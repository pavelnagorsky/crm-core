import { PaymentOperation } from '@prisma/client';

/** The fields of an operation that decide whether it can be undone. */
export type UndoablePaymentOperation = Pick<
  PaymentOperation,
  'type' | 'replacesOperationId' | 'createdById' | 'createdAt'
>;
