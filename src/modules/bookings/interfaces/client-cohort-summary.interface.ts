import { Prisma } from '@prisma/client';

export interface ClientCohortSummary {
  /** Completed visits in the range that are the client's first ever. */
  newVisits: number;
  /** Completed visits in the range after the client's first. */
  returningVisits: number;
  /** Distinct clients with at least one completed visit in the range. */
  activeClients: number;
  revenue: Prisma.Decimal;
}
