import type { Brand } from '@prisma/client';
import type { FieldDescriptor } from '../utils/diff-fields.js';

export const BUSINESS_AUDIT_FIELDS: FieldDescriptor<Brand>[] = [
  { key: 'name' },
];
