import { Prisma } from '@prisma/client';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { PaymentRequest } from './payment-request.interface.js';

/** Record or replace the payment of an order. The caller holds the order lock. */
export interface PaymentCommand {
  locationId: string;
  orderId: string;
  currency: string;
  /** Computed by the caller under the order lock. */
  amountDue: Prisma.Decimal;
  request: PaymentRequest;
  /** Date of a new payment without an explicit date. A replacement keeps the replaced date. */
  defaultOccurredAt: Date;
  idempotencyKey: string;
  requestHash: string;
  actor: AuditActor;
  /** Whether an active payment may be replaced (order:write). */
  canReplace: boolean;
}
