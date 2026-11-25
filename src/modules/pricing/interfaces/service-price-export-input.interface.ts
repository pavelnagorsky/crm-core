import { PriceLevel } from '@prisma/client';
import { StaffAssignmentRow } from '../../staff/interfaces/staff-assignment-row.interface.js';
import { ServicePriceCatalog } from '../../services/catalog/interfaces/service-price-catalog.interface.js';
import { ServiceLevelPriceRow } from './service-level-price-row.interface.js';

export interface ServicePriceExportInput {
  catalog: ServicePriceCatalog;
  levels: readonly PriceLevel[];
  levelPrices: readonly ServiceLevelPriceRow[];
  assignments: readonly StaffAssignmentRow[];
}
