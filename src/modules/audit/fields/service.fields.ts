import { Prisma, type Service } from '@prisma/client';
import { MoneyService } from '../../../shared/money/money.service.js';
import type { FieldDescriptor } from '../utils/diff-fields.js';

export const SERVICE_AUDIT_FIELDS: FieldDescriptor<Service>[] = [
  { key: 'title' },
  { key: 'price', format: (v) => (v == null ? '—' : MoneyService.format(v as Prisma.Decimal)) },
  { key: 'durationMinutes' },
  { key: 'bufferMinutes' },
  { key: 'description' },
  { key: 'status' },
];
