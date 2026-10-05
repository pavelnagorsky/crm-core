import { Prisma, type Service } from '@prisma/client';
import { MoneyService } from '../../../shared/money/money.service.js';
import type { FieldDescriptor } from '../utils/diff-fields.js';

export type ServiceAuditShape = {
  title: Service['title'];
  price: Service['price'];
  durationMinutes: Service['durationMinutes'];
  bufferMinutes: Service['bufferMinutes'];
  description: Service['description'];
  status: Service['status'];
  sortOrder: Service['sortOrder'];
  categoryName: string | null;
  imageName: string | null;
};

export type ServiceAuditSource = {
  title: string;
  price: Prisma.Decimal;
  durationMinutes: number;
  bufferMinutes: number;
  description: string | null;
  status: Service['status'];
  sortOrder: number;
  category: { name: string } | null;
  imageFile: { fileName: string } | null;
};

export function toServiceAuditShape(service: ServiceAuditSource): ServiceAuditShape {
  return {
    title: service.title,
    price: service.price,
    durationMinutes: service.durationMinutes,
    bufferMinutes: service.bufferMinutes,
    description: service.description,
    status: service.status,
    sortOrder: service.sortOrder,
    categoryName: service.category?.name ?? null,
    imageName: service.imageFile?.fileName ?? null,
  };
}

export const SERVICE_AUDIT_FIELDS: FieldDescriptor<ServiceAuditShape>[] = [
  { key: 'title' },
  { key: 'price', format: (v) => (v == null ? '—' : MoneyService.format(v as Prisma.Decimal)) },
  { key: 'durationMinutes' },
  { key: 'bufferMinutes' },
  { key: 'description' },
  { key: 'status' },
  { key: 'sortOrder' },
  { key: 'categoryName' },
  { key: 'imageName' },
];
