import { Prisma } from '@prisma/client';
import { ServicePriceEntry } from '../../services/catalog/interfaces/service-price-entry.interface.js';
import { ServiceLevelPriceRow } from './service-level-price-row.interface.js';

export interface StaffServicePricesInput {
  staffId: string;
  /** Null: the default level. */
  levelId: string | null;
  services: readonly ServicePriceEntry[];
  /** Level prices of the staff member's level, empty for the default level. */
  levelPrices: readonly ServiceLevelPriceRow[];
  personalPrices: ReadonlyMap<string, Prisma.Decimal | null>;
}
