import { PriceLevel } from '@prisma/client';

export interface PriceLevelView extends PriceLevel {
  staffCount: number;
}
