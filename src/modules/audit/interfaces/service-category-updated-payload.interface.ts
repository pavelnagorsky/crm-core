import { AuditFieldChange } from './audit-field-change.interface.js';

export interface ServiceCategoryUpdatedPayload {
  changes: AuditFieldChange[];
}
