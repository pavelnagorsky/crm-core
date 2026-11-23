import { AuditFieldChange } from './audit-field-change.interface.js';

export interface PriceLevelUpdatedPayload {
  changes: AuditFieldChange[];
}
