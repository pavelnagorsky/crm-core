import { AuditFieldChange } from './audit-field-change.interface.js';

/** Personal price changes of one staff member; the field of a change is the service title. */
export interface StaffPricesUpdatedPayload {
  title: string;
  changes: AuditFieldChange[];
}
