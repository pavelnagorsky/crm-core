import type { Staff } from '@prisma/client';
import type { FieldDescriptor } from '../utils/diff-fields.js';

export const STAFF_AUDIT_FIELDS: FieldDescriptor<Staff>[] = [
  { key: 'name', labelRu: 'Имя' },
  { key: 'roleTitle', labelRu: 'Должность' },
  { key: 'isActive', labelRu: 'Активен' },
];
