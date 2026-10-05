import type { ServiceCategory } from '@prisma/client';
import type { FieldDescriptor } from '../utils/diff-fields.js';

export const SERVICE_CATEGORY_AUDIT_FIELDS: FieldDescriptor<ServiceCategory>[] = [
  { key: 'name' },
  { key: 'description' },
  { key: 'sortOrder' },
];
