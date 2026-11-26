import { AuditEntity } from '../../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../../audit/enums/audit-event.enum.js';

/** The audit entity and events of one price change catalog. */
export interface PriceChangeAuditEvents {
  entity: AuditEntity;
  created: AuditEvent;
  imported: AuditEvent;
  applied: AuditEvent;
  cancelled: AuditEvent;
  rolledBack: AuditEvent;
}
