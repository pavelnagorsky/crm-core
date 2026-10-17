import { ClientRevenueBucketTotals } from '../../../../shared/interfaces/client-revenue-bucket-totals.interface.js';

export interface OrderClientRevenueBucket extends ClientRevenueBucketTotals {
  /** Clients in this bucket who also have completed-service revenue in it. */
  sharedClients: number;
}
