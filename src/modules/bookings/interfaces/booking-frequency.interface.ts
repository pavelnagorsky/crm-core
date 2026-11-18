import { ServiceCatalogKind } from '../../services/enums/service-catalog-kind.enum.js';

/** How often a service or bundle was booked in completed visits. */
export interface BookingFrequency {
  kind: ServiceCatalogKind;
  id: string;
  locationId: string;
  title: string;
  /** Completed visits that included it. */
  count: number;
  /** Start of the latest of those visits. */
  lastAt: Date;
}
