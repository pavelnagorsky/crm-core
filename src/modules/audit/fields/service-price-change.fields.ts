import type { PriceChange } from '@prisma/client';
import type { FieldDescriptor } from '../interfaces/field-descriptor.interface.js';

export const SERVICE_PRICE_CHANGE_AUDIT_FIELDS: FieldDescriptor<PriceChange>[] =
  [{ key: 'effectiveDate', type: 'date' }];
