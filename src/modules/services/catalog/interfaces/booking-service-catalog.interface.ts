import { Prisma } from '@prisma/client';
import {
  BOOKING_BUNDLE_SELECT,
  BOOKING_SERVICE_SELECT,
} from '../constants/booking-catalog.select.js';
import { BookingCatalogSnapshot } from './booking-catalog-snapshot.interface.js';

export interface BookingServiceCatalog {
  categories: (BookingCatalogSnapshot['categories'][number] & {
    services: BookingServiceCatalog['services'];
    bundles: BookingServiceCatalog['bundles'];
  })[];
  services: Prisma.ServiceGetPayload<{
    select: typeof BOOKING_SERVICE_SELECT;
  }>[];
  bundles: Prisma.ServiceBundleGetPayload<{
    select: typeof BOOKING_BUNDLE_SELECT;
  }>[];
}
