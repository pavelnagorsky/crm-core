import { ServiceCategory } from '@prisma/client';
import { ServiceBundleView } from './service-bundle-view.interface.js';
import { ServiceWithImage } from './service-with-image.interface.js';

export interface BookingServiceCatalog {
  categories: (ServiceCategory & {
    services: ServiceWithImage[];
    bundles: ServiceBundleView[];
  })[];
  services: ServiceWithImage[];
  bundles: ServiceBundleView[];
}
