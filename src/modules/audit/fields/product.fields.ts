import { Prisma } from '@prisma/client';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { QuantityUtils } from '../../../shared/quantity/quantity.utils.js';
import type { FieldDescriptor } from '../interfaces/field-descriptor.interface.js';

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
        value == null ? '-' : MoneyUtils.format(value as Prisma.Decimal),
    },
    { key: 'trackInventory' },
    {
      key: 'reorderLevel',
      format: (value) =>
        value == null ? '-' : QuantityUtils.format(value as Prisma.Decimal),
    },
    { key: 'sortOrder' },
  ];
