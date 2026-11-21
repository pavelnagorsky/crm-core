import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';

/** Undo a payment its author has just recorded. The caller holds the order lock. */
export interface UndoPaymentCommand {
  locationId: string;
  orderId: string;
  operationId: string;
  actor: AuditActor;
  now: Date;
}
