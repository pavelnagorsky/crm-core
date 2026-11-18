import { ServiceCatalogKind } from '../../services/enums/service-catalog-kind.enum.js';

/** A raw frequency row from SQL; bundle titles come from the catalog afterwards. */
export interface BookingFrequencyRow {
  staffId: string | null;
  kind: ServiceCatalogKind;
  id: string;
  locationId: string;
  title: string | null;
  count: number;
  lastAt: Date;
}
