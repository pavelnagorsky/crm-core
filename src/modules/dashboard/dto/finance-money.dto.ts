import { ApiSignedAmount } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { PaymentMoneyTotals } from '../../payments/interfaces/payment-money-totals.interface.js';

/** Money that changed hands in the period, net of refunds. */
export class FinanceMoneyDto {
  @ApiSignedAmount({ description: 'Cash payments minus cash refunds.' })
  cash: string;

  @ApiSignedAmount({ description: 'Card payments minus card refunds.' })
  card: string;

  @ApiSignedAmount({ description: 'cash + card.' })
  total: string;

  static fromTotals(totals: PaymentMoneyTotals): FinanceMoneyDto {
    return Object.assign(new FinanceMoneyDto(), {
      cash: MoneyUtils.format(totals.cash),
      card: MoneyUtils.format(totals.card),
      total: MoneyUtils.format(totals.total),
    });
  }
}
