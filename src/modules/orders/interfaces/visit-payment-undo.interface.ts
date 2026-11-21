import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';

/** Undo of a first payment of a visit by its author. */
export interface VisitPaymentUndo {
  locationId: string;
  bookingId: string;
  operationId: string;
  actor: AuditActor;
  now: Date;
  /** Set when the caller may manage only visits they take part in (booking.own:write). */
  participantStaffId?: string;
}
