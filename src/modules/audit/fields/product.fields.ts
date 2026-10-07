import { Prisma } from '@prisma/client';
import { MoneyService } from '../../../shared/money/money.service.js';
import { QuantityService } from '../../../shared/quantity/quantity.service.js';
import type { FieldDescriptor } from '../utils/diff-fields.js';

export const PRODUCT_AUDIT_FIELDS: FieldDescriptor<Record<string, unknown>>[] =
  [
    { key: 'name' },
    { key: 'description' },
    { key: 'sku' },
    { key: 'barcode' },
    { key: 'unit', i18n: 'productUnit' },
    { key: 'status', i18n: 'serviceStatus' },
    { key: 'categoryId' },
    { key: 'imageFileId' },
    {
      key: 'retailPrice',
      format: (value) =>
        value == null ? '-' : MoneyService.format(value as Prisma.Decimal),
    },
    { key: 'trackInventory' },
    {
      key: 'reorderLevel',
      format: (value) =>
        value == null ? '-' : QuantityService.format(value as Prisma.Decimal),
    },
    { key: 'sortOrder' },
  ];
