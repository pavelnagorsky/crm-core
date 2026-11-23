import { AuditFieldChange } from './audit-field-change.interface.js';

/** Price changes of one service; the field of a change is the level or staff name. */
export interface ServicePricesUpdatedPayload {
  title: string;
  levelChanges?: AuditFieldChange[];
  staffChanges?: AuditFieldChange[];
}
