import { AuditFieldChange } from './audit-field-change.interface.js';

export interface PriceRuleUpdatedPayload {
  name: string;
  /** PriceRuleKind; a promotion gets «Акция» titles. */
  kind?: string;
  changes: AuditFieldChange[];
}
