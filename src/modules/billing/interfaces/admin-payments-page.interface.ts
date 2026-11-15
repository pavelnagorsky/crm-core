import { SubscriptionPayment } from '@prisma/client';
import { PaginatedResult } from '../../../shared/interfaces/paginated-result.interface.js';

export interface AdminPaymentsPage extends PaginatedResult<SubscriptionPayment> {
  brandNames: Map<string, string>;
}
