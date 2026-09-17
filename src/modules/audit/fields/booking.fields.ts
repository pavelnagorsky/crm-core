import type { Booking } from '@prisma/client';
import type { FieldDescriptor } from '../utils/diff-fields.js';

export const BOOKING_AUDIT_FIELDS: FieldDescriptor<Booking>[] = [
  { key: 'startAt', type: 'datetime' },
  { key: 'endAt', type: 'datetime' },
  { key: 'customPrice', format: (v) => String(v ?? '—') },
  { key: 'notes' },
  { key: 'internalNotes' },
];
