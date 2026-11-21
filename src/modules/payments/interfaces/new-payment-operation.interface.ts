import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { PaymentType } from '../enums/payment-type.enum.js';
import { PaymentPart } from './payment-part.interface.js';

/** A journal operation to create: one record per part, all on the same date. */
export interface NewPaymentOperation {
  locationId: string;
  orderId: string;
  currency: string;
  type: PaymentType;
  parts: readonly PaymentPart[];
  occurredAt: Date;
  idempotencyKey: string;
  requestHash: string;
  replacesOperationId: string | null;
  orderReturnId: string | null;
  reason: string | null;
  actor: AuditActor;
}
