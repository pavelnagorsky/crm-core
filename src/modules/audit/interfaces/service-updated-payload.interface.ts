import { AuditFieldChange } from './audit-field-change.interface.js';

export interface ServiceUpdatedPayload {
  changes: AuditFieldChange[];
  currency?: string;
}
