import type { Service } from '@prisma/client';
import type { FieldDescriptor } from '../utils/diff-fields.js';

export const SERVICE_AUDIT_FIELDS: FieldDescriptor<Service>[] = [
  { key: 'title', labelRu: 'Название' },
  { key: 'price', labelRu: 'Цена', format: (v) => String(v ?? '—') },
  { key: 'durationMinutes', labelRu: 'Длительность (мин)' },
  { key: 'bufferMinutes', labelRu: 'Буфер (мин)' },
  { key: 'description', labelRu: 'Описание' },
  { key: 'isActive', labelRu: 'Активна' },
];
