import type { Brand } from '@prisma/client';
import type { FieldDescriptor } from '../interfaces/field-descriptor.interface.js';

export const BUSINESS_AUDIT_FIELDS: FieldDescriptor<Brand>[] = [
  { key: 'name' },
];
