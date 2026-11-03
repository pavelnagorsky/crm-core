import { AuditFieldChange } from './audit-field-change.interface.js';

export interface EntityAuditPayload {
  title: string;
  changes?: AuditFieldChange[];
  occurrenceDate?: string;
}
