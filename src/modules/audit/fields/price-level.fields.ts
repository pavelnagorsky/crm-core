import type { PriceLevel } from '@prisma/client';
import type { FieldDescriptor } from '../interfaces/field-descriptor.interface.js';

export const PRICE_LEVEL_AUDIT_FIELDS: FieldDescriptor<PriceLevel>[] = [
  { key: 'name' },
  { key: 'sortOrder' },
  { key: 'isDefault', i18n: 'booleanValue' },
];
