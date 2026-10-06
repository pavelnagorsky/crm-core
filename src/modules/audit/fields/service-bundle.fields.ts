import { Prisma } from '@prisma/client';
import { MoneyService } from '../../../shared/money/money.service.js';
import type { FieldDescriptor } from '../utils/diff-fields.js';

export type ServiceBundleAuditShape = {
  title: string;
  description: string | null;
  categoryName: string | null;
  imageName: string | null;
  executionMode: string;
  pricingMode: string;
  fixedPrice: Prisma.Decimal | null;
  status: string;
  sortOrder: number;
  items: string;
};

export type ServiceBundleAuditSource = {
  title: string;
  description: string | null;
  executionMode: string;
  pricingMode: string;
  fixedPrice: Prisma.Decimal | null;
  status: string;
  sortOrder: number;
  category: { name: string } | null;
  imageFile: { fileName: string } | null;
  items: { service: { title: string } }[];
};

export function toServiceBundleAuditShape(
  bundle: ServiceBundleAuditSource,
): ServiceBundleAuditShape {
  return {
    title: bundle.title,
    description: bundle.description,
    categoryName: bundle.category?.name ?? null,
    imageName: bundle.imageFile?.fileName ?? null,
    executionMode: bundle.executionMode,
    pricingMode: bundle.pricingMode,
    fixedPrice: bundle.fixedPrice,
    status: bundle.status,
    sortOrder: bundle.sortOrder,
    items: bundle.items.map((item) => item.service.title).join(', '),
  };
}

export const SERVICE_BUNDLE_AUDIT_FIELDS: FieldDescriptor<ServiceBundleAuditShape>[] =
  [
    { key: 'title' },
    { key: 'description' },
    { key: 'categoryName' },
    { key: 'imageName' },
    { key: 'executionMode', i18n: 'executionMode' },
    { key: 'pricingMode', i18n: 'bundlePricingMode' },
    {
      key: 'fixedPrice',
      format: (v) =>
        v == null ? '—' : MoneyService.format(v as Prisma.Decimal),
    },
    { key: 'status' },
    { key: 'sortOrder' },
    { key: 'items' },
  ];
