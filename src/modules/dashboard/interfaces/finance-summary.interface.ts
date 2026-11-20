import { NotSpecifiedResult } from '../../orders/aggregates/interfaces/not-specified-result.interface.js';
import { PaymentMoneyTotals } from '../../payments/interfaces/payment-money-totals.interface.js';

export interface FinanceSummary {
  from: string;
  to: string;
  currency: string;
  timezone: string;
  money: PaymentMoneyTotals;
  notSpecified: NotSpecifiedResult;
}
