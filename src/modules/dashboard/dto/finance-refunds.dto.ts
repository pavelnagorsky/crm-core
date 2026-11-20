import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { PaymentMoneyTotals } from '../../payments/interfaces/payment-money-totals.interface.js';

/** Refunds of the period, already subtracted from money. Shown only when not zero. */
export class FinanceRefundsDto {
  @ApiPrice()
  cash: string;

  @ApiPrice()
  card: string;

  static fromTotals(totals: PaymentMoneyTotals): FinanceRefundsDto {
    return Object.assign(new FinanceRefundsDto(), {
      cash: MoneyUtils.format(totals.refundCash),
      card: MoneyUtils.format(totals.refundCard),
    });
  }
}
