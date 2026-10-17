import { ClientRevenueTotals } from '../../../../shared/interfaces/client-revenue-totals.interface.js';

export interface OrderClientRevenueTotals extends ClientRevenueTotals {
  /** Clients who also have completed-service revenue in the same window. */
  sharedClients: number;
}
