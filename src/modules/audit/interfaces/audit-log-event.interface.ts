import { AuditEntity } from '../enums/audit-entity.enum.js';
import { AuditEvent } from '../enums/audit-event.enum.js';
import { AuditActor } from './audit-actor.interface.js';
import { AuditPayload } from './audit-payload.interface.js';

export interface AuditLogEvent {
  businessId: string;
  entityType: AuditEntity;
  entityId: string;
  eventType: AuditEvent;
  actor: AuditActor;
  payload: AuditPayload;
}
