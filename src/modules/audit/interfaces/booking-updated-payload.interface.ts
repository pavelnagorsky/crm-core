import { AuditFieldChange } from './audit-field-change.interface.js';

export interface BookingUpdatedPayload {
  changes: AuditFieldChange[];
  currency?: string;
}
