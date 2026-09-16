import { AuditEntity } from '../enums/audit-entity.enum.js';
import { AuditEvent } from '../enums/audit-event.enum.js';
import { AuditActionType } from '../enums/audit-action-type.enum.js';
import { AuditActor } from './audit-actor.interface.js';
import { AuditPayload } from './audit-payload.interface.js';

export interface AuditLogEvent {
  businessId: string;
  entityType: AuditEntity;
  entityId: string;
  eventType: AuditEvent;
  actionType: AuditActionType;
  actor: AuditActor;
  payload: AuditPayload;
}
