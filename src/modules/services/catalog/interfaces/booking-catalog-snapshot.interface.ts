import { Prisma, ServiceCategory } from '@prisma/client';
import {
  BOOKING_BUNDLE_SELECT,
  BOOKING_SERVICE_SELECT,
} from '../constants/booking-catalog.select.js';

export interface BookingCatalogSnapshot {
  categories: Pick<
    ServiceCategory,
    'id' | 'name' | 'description' | 'sortOrder'
  >[];
  services: Prisma.ServiceGetPayload<{
    select: typeof BOOKING_SERVICE_SELECT;
  }>[];
  bundles: (Omit<
    Prisma.ServiceBundleGetPayload<{ select: typeof BOOKING_BUNDLE_SELECT }>,
    'items'
  > & {
    items: { serviceId: string; sortOrder: number }[];
  })[];
}
