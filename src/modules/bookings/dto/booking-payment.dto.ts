import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { PaymentSummaryDto } from '../../payments/dto/payment-summary.dto.js';
import { VisitPaymentSummary } from '../interfaces/visit-payment-summary.interface.js';

/** Payment of a visit. amountDue = servicesAmount + productsAmount. */
export class BookingPaymentDto extends PaymentSummaryDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Visit order; null while the booking has none.',
  })
  orderId: string | null;

  @ApiPrice({
    description:
      'Services due: sum of customPrice ?? chargedPrice of the booking items for PENDING, CONFIRMED and COMPLETED; 0 for NO_SHOW and CANCELLED.',
  })
  servicesAmount: string;

  @ApiPrice({
    description:
      'Products sold in the visit order: confirmed product lines minus posted returns. Drafts are not included.',
  })
  productsAmount: string;

  @ApiProperty({
    type: Number,
    minimum: 0,
    description:
      'Draft (not yet sold) PRODUCT lines of the visit order; 0 without an order.',
  })
  draftProductsCount: number;

  static fromSummary(summary: VisitPaymentSummary): BookingPaymentDto {
    return Object.assign(new BookingPaymentDto(), {
      ...PaymentSummaryDto.from(
        summary.amountDue,
        summary.totals,
        summary.tracked,
      ),
      orderId: summary.orderId,
      servicesAmount: MoneyUtils.format(summary.servicesAmount),
      productsAmount: MoneyUtils.format(summary.productsAmount),
      draftProductsCount: summary.draftProductsCount,
    });
  }
}
