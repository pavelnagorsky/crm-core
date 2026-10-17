import { File, Prisma, ServiceBundle } from '@prisma/client';

export interface ServiceBundleForCatalog extends ServiceBundle {
  imageFile: File | null;
  category: { name: string } | null;
  items: Array<{
    serviceId: string;
    sortOrder: number;
    service: {
      title: string;
      price: Prisma.Decimal;
      durationMinutes: number;
      bufferMinutes: number;
    };
  }>;
}
