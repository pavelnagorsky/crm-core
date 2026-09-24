import { DocumentMessages } from './document-messages.interface.js';

export interface I18nLocale {
  email: Record<string, Record<string, unknown>>;
  auditEvent: Record<string, string>;
  actorRole: Record<string, string>;
  bookingStatus: Record<string, string>;
  staffStatus: Record<string, string>;
  employmentType: Record<string, string>;
  payoutMethod: Record<string, string>;
  earningType: Record<string, string>;
  salaryMode: Record<string, string>;
  payrollPeriodStatus: Record<string, string>;
  documents: DocumentMessages;
  fields: Record<string, Record<string, string>>;
}
