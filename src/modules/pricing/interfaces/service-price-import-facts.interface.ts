import { PriceLevel } from '@prisma/client';
import { ServicePriceCatalog } from '../../services/catalog/interfaces/service-price-catalog.interface.js';
import { StaffAssignmentRow } from '../../staff/interfaces/staff-assignment-row.interface.js';
import { PriceTimeline } from '../engine/price-timeline.js';
import { ServiceLevelPriceRow } from './service-level-price-row.interface.js';

/** What the prices of a file are compared with: the stored prices and the scheduled changes. */
export interface ServicePriceImportFacts {
  catalog: ServicePriceCatalog;
  levels: readonly PriceLevel[];
  levelPrices: readonly ServiceLevelPriceRow[];
  assignments: readonly StaffAssignmentRow[];
  timeline: PriceTimeline;
  /** YYYY-MM-DD: the effective date of the import, or today of the location. */
  date: string;
}
