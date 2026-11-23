import { Prisma } from '@prisma/client';
import { ServiceLevelPriceView } from './service-level-price-view.interface.js';
import { ServiceStaffPriceView } from './service-staff-price-view.interface.js';

export interface ServicePricesView {
  serviceId: string;
  basePrice: Prisma.Decimal;
  priceFrom: Prisma.Decimal;
  priceTo: Prisma.Decimal;
  levels: ServiceLevelPriceView[];
  staff: ServiceStaffPriceView[];
}
