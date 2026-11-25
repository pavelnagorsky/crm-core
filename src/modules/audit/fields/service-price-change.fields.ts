import type { ServicePriceChange } from '@prisma/client';
import type { FieldDescriptor } from '../interfaces/field-descriptor.interface.js';

export const SERVICE_PRICE_CHANGE_AUDIT_FIELDS: FieldDescriptor<ServicePriceChange>[] =
  [{ key: 'effectiveDate', type: 'date' }];
