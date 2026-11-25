import { ServiceStatus } from '@prisma/client';
import { ServicePriceChangeGroupKind } from '../enums/service-price-change-group-kind.enum.js';
import { PriceChangeRow } from './price-change-row.interface.js';

/** The rows of one service or bundle. */
export interface PriceChangeGroup {
  kind: ServicePriceChangeGroupKind;
  id: string;
  title: string;
  categoryId: string | null;
  categoryName: string | null;
  status: ServiceStatus;
  rows: PriceChangeRow[];
}
