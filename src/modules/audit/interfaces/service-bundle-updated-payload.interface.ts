import { AuditFieldChange } from './audit-field-change.interface.js';

export interface ServiceBundleUpdatedPayload {
  changes: AuditFieldChange[];
  currency?: string;
}
