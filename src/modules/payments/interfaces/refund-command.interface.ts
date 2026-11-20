import { Prisma } from '@prisma/client';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { PaymentMethod } from '../enums/payment-method.enum.js';

/** Give money back. The caller holds the order lock. */
export interface RefundCommand {
  locationId: string;
  orderId: string;
  currency: string;
  method: PaymentMethod;
  amount: Prisma.Decimal;
  occurredAt: Date;
  reason: string | null;
  idempotencyKey: string;
  requestHash: string;
  /** The product return the refund is part of. */
  orderReturnId: string | null;
  actor: AuditActor;
}
