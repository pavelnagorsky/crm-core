import type { FieldType } from '../utils/diff-fields.js';
import { BOOKING_AUDIT_FIELDS } from './booking.fields.js';
import { CLIENT_AUDIT_FIELDS } from './client.fields.js';
import { STAFF_AUDIT_FIELDS } from './staff.fields.js';
import { SERVICE_AUDIT_FIELDS } from './service.fields.js';
import { BUSINESS_AUDIT_FIELDS } from './business.fields.js';

const allFields = [
  ...BOOKING_AUDIT_FIELDS,
  ...CLIENT_AUDIT_FIELDS,
  ...STAFF_AUDIT_FIELDS,
  ...SERVICE_AUDIT_FIELDS,
  ...BUSINESS_AUDIT_FIELDS,
];

export const AUDIT_FIELD_TYPES: Record<string, FieldType> = Object.fromEntries(
  allFields.filter((f) => f.type).map((f) => [String(f.key), f.type!]),
);

export const AUDIT_FIELD_I18N: Record<string, string> = Object.fromEntries(
  allFields.filter((f) => f.i18n).map((f) => [String(f.key), f.i18n!]),
);
