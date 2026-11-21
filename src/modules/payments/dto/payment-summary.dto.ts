import { ApiProperty } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import {
  ApiPrice,
  ApiSignedAmount,
} from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { PaymentStatus } from '../enums/payment-status.enum.js';
import { OrderPaymentTotals } from '../interfaces/order-payment-totals.interface.js';
import { paymentStatusOf } from '../rules/payment-state.rules.js';
import { PaymentOperationDto } from './payment-operation.dto.js';

export class PaymentSummaryDto {
  @ApiProperty({
    enum: PaymentStatus,
    enumName: 'PaymentStatus',
    description:
      'Derived from amountDue and the active records: NOT_REQUIRED (no records, nothing due), NOT_SPECIFIED (no records, something due, payment tracked), NOT_TRACKED (no records, something due, but the visit or sale is not in payment tracking: tracking is DISABLED or it started before Location.paymentTrackingSince; show nothing), PAID, UNDERPAID, OVERPAID (records exist; paidAmount compared with amountDue, regardless of tracking).',
  })
  status: PaymentStatus;

  @ApiPrice({ description: 'Amount due now.' })
  amountDue: string;

  @ApiSignedAmount({
    description: 'Active payments minus active refunds.',
  })
  paidAmount: string;

  @ApiSignedAmount({ description: 'Net cash: payments minus refunds.' })
  cashAmount: string;

  @ApiSignedAmount({ description: 'Net card: payments minus refunds.' })
  cardAmount: string;

  @ApiProperty({
    type: () => PaymentOperationDto,
    nullable: true,
    description: 'The active payment, null when there is none.',
  })
  payment: PaymentOperationDto | null;

  @ApiProperty({
    type: () => PaymentOperationDto,
    isArray: true,
    description:
      'Active refunds, oldest first. A new payment must cover amountDue plus these refunds.',
  })
  refunds: PaymentOperationDto[];

  static from(
    amountDue: Prisma.Decimal,
    totals: OrderPaymentTotals | null | undefined,
    tracked: boolean,
  ): PaymentSummaryDto {
    const dto = new PaymentSummaryDto();
    dto.status = paymentStatusOf(amountDue, totals, tracked);
    dto.amountDue = MoneyUtils.format(amountDue);
    dto.paidAmount = MoneyUtils.format(totals?.paidAmount);
    dto.cashAmount = MoneyUtils.format(totals?.cashAmount);
    dto.cardAmount = MoneyUtils.format(totals?.cardAmount);
    dto.payment = totals?.payment
      ? PaymentOperationDto.fromEntity(totals.payment)
      : null;
    dto.refunds = (totals?.refunds ?? []).map(PaymentOperationDto.fromEntity);
    return dto;
  }
}
