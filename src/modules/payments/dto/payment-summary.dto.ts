import { ApiProperty } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import {
  ApiPrice,
  ApiSignedAmount,
} from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { PaymentStatus } from '../enums/payment-status.enum.js';
import { OrderPaymentTotals } from '../interfaces/order-payment-totals.interface.js';
import { paymentStatus } from '../rules/payment-state.rules.js';
import { PaymentOperationDto } from './payment-operation.dto.js';

export class PaymentSummaryDto {
  @ApiProperty({
    enum: PaymentStatus,
    enumName: 'PaymentStatus',
    description:
      'Derived from amountDue and the active records: NOT_REQUIRED (no records, nothing due), NOT_SPECIFIED (no records, something due), PAID, UNDERPAID, OVERPAID (records exist; paidAmount compared with amountDue).',
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
  ): PaymentSummaryDto {
    const dto = new PaymentSummaryDto();
    const zero = MoneyUtils.decimal(0);
    dto.status = paymentStatus(amountDue, {
      paidAmount: totals?.paidAmount ?? zero,
      hasRecords: totals?.hasRecords ?? false,
    });
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
