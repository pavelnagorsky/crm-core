import { AuditFieldChange } from './audit-field-change.interface.js';

export interface PriceRuleUpdatedPayload {
  name: string;
  changes: AuditFieldChange[];
}
