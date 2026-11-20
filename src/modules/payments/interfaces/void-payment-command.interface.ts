import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';

/** Void every active record of one operation. The caller holds the order lock. */
export interface VoidPaymentCommand {
  locationId: string;
  orderId: string;
  operationId: string;
  reason: string | null;
  actor: AuditActor;
}
