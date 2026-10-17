import { AuditActionType } from '../../audit/enums/audit-action-type.enum.js';
import { AuditEvent } from '../../audit/enums/audit-event.enum.js';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';

export interface BookingAuditInput {
  locationId: string;
  entityId: string;
  eventType: AuditEvent;
  actionType: AuditActionType;
  actor: AuditActor;
  payload: Record<string, unknown>;
}
