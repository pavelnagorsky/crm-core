import { Prisma } from '@prisma/client';

export type PaymentOperationWithPayments = Prisma.PaymentOperationGetPayload<{
  include: { payments: true };
}>;
