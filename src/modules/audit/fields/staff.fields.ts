import type { Staff } from '@prisma/client';
import type { FieldDescriptor } from '../utils/diff-fields.js';

export const STAFF_AUDIT_FIELDS: FieldDescriptor<Staff>[] = [
  { key: 'name' },
  { key: 'roleTitle' },
  { key: 'phone' },
  { key: 'email' },
  { key: 'status', i18n: 'staffStatus' },
];
