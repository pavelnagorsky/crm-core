import { PriceLevel, Prisma } from '@prisma/client';
import { StaffServicePriceRow } from '../../staff/interfaces/staff-service-price-row.interface.js';
import { ServiceLevelPriceRow } from './service-level-price-row.interface.js';

export interface ServicePricesInput {
  serviceId: string;
  basePrice: Prisma.Decimal;
  levels: readonly PriceLevel[];
  levelPrices: readonly ServiceLevelPriceRow[];
  staffRows: readonly StaffServicePriceRow[];
  /** Staff per level id; the key null is the staff without a level. */
  staffCounts: ReadonlyMap<string | null, number>;
}
