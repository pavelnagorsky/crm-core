import type { Booking } from '@prisma/client';
import type { FieldDescriptor } from '../utils/diff-fields.js';

export const BOOKING_AUDIT_FIELDS: FieldDescriptor<Booking>[] = [
  { key: 'startAt', labelRu: 'Начало', format: (v) => new Date(v as string).toLocaleString('ru-RU') },
  { key: 'endAt', labelRu: 'Конец', format: (v) => new Date(v as string).toLocaleString('ru-RU') },
  { key: 'price', labelRu: 'Цена', format: (v) => String(v ?? '—') },
  { key: 'notes', labelRu: 'Заметки' },
];
