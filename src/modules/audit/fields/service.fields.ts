import type { Service } from '@prisma/client';
import type { FieldDescriptor } from '../utils/diff-fields.js';

export const SERVICE_AUDIT_FIELDS: FieldDescriptor<Service>[] = [
  { key: 'title' },
  { key: 'price', format: (v) => String(v ?? '—') },
  { key: 'durationMinutes' },
  { key: 'bufferMinutes' },
  { key: 'description' },
  { key: 'status' },
];
