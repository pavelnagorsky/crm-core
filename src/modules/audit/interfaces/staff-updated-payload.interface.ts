import { AuditFieldChange } from './audit-field-change.interface.js';

export interface StaffUpdatedPayload {
  changes: AuditFieldChange[];
}
