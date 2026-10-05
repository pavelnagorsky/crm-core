import { File, Prisma } from '@prisma/client';
import { ServiceStatus } from '../enums/service-status.enum.js';

export interface ServiceCatalogEntry {
  id: string;
  businessId: string;
  categoryId: string | null;
  categoryName: string | null;
  imageFile: File | null;
  title: string;
  description: string | null;
  price: Prisma.Decimal;
  durationMinutes: number;
  status: ServiceStatus;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}
