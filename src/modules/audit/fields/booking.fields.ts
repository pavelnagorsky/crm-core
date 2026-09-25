import { Prisma, type Booking } from '@prisma/client';
import { MoneyService } from '../../../shared/money/money.service.js';
import type { FieldDescriptor } from '../utils/diff-fields.js';

export const BOOKING_AUDIT_FIELDS: FieldDescriptor<Booking>[] = [
  { key: 'staffId' },
  { key: 'serviceId' },
  { key: 'startAt', type: 'datetime' },
  { key: 'endAt', type: 'datetime' },
  { key: 'clientFirstName' },
  { key: 'clientLastName' },
  { key: 'clientPhone' },
  { key: 'clientEmail' },
  { key: 'customPrice', format: (v) => (v == null ? '—' : MoneyService.format(v as Prisma.Decimal)) },
  { key: 'notes' },
  { key: 'internalNotes' },
];
