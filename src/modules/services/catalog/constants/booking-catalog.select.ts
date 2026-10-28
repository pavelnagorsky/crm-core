import { Prisma } from '@prisma/client';
import { PUBLIC_FILE_SELECT } from '../../../../shared/database/public-file.select.js';

export const BOOKING_SERVICE_SELECT = {
  id: true,
  categoryId: true,
  title: true,
  description: true,
  price: true,
  durationMinutes: true,
  bufferMinutes: true,
  sortOrder: true,
  status: true,
  imageFile: { select: PUBLIC_FILE_SELECT },
} satisfies Prisma.ServiceSelect;

export const BOOKING_BUNDLE_SELECT = {
  id: true,
  categoryId: true,
  title: true,
  description: true,
  fixedPrice: true,
  executionMode: true,
  sortOrder: true,
  imageFile: { select: PUBLIC_FILE_SELECT },
  items: {
    orderBy: { sortOrder: 'asc' as const },
    select: {
      serviceId: true,
      sortOrder: true,
      service: { select: BOOKING_SERVICE_SELECT },
    },
  },
} satisfies Prisma.ServiceBundleSelect;
