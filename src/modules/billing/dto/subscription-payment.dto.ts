import { ApiProperty } from '@nestjs/swagger';
import {
  BillingActorRole,
  BillingPeriod,
  SubscriptionPayment,
  SubscriptionPaymentMethod,
  SubscriptionPaymentProvider,
  SubscriptionPaymentStatus,
} from '@prisma/client';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { PaymentReference } from '../compute/payment-reference.js';

/** A payment as the brand owner sees it: no admin note, no provider data. */
export class SubscriptionPaymentDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 123 })
  number: number;

  @ApiProperty({
    example: 'KL-000123',
    description: 'Number for the payment purpose',
  })
  displayNumber: string;

  @ApiProperty({
    example: 'Команда',
    description: 'Plan name at the moment of the request',
  })
  planName: string;

  @ApiProperty({ enum: BillingPeriod, enumName: 'BillingPeriod' })
  billingPeriod: BillingPeriod;

  @ApiProperty({ example: 'BY' })
  countryCode: string;

  @ApiProperty({ example: 'BYN' })
  currency: string;

  @ApiPrice()
  amount: string;

  @ApiProperty({
    enum: SubscriptionPaymentProvider,
    enumName: 'SubscriptionPaymentProvider',
  })
  provider: SubscriptionPaymentProvider;

  @ApiProperty({
    enum: SubscriptionPaymentStatus,
    enumName: 'SubscriptionPaymentStatus',
  })
  status: SubscriptionPaymentStatus;

  @ApiProperty({
    enum: SubscriptionPaymentMethod,
    enumName: 'SubscriptionPaymentMethod',
    nullable: true,
  })
  method: SubscriptionPaymentMethod | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Bank or ERIP reference',
  })
  reference: string | null;

  @ApiProperty({ type: String, nullable: true })
  failureReason: string | null;

  @ApiProperty({ type: String, nullable: true })
  ownerComment: string | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'PENDING: the request expires at this moment',
  })
  expiresAt: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  paidAt: Date | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Paid period start; set when the payment is applied',
  })
  periodStart: Date | null;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Paid period end, exclusive',
  })
  periodEnd: Date | null;

  @ApiProperty({ enum: BillingActorRole, enumName: 'BillingActorRole' })
  createdByRole: BillingActorRole;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  static fromEntity(payment: SubscriptionPayment): SubscriptionPaymentDto {
    return SubscriptionPaymentDto.fill(new SubscriptionPaymentDto(), payment);
  }

  protected static fill<T extends SubscriptionPaymentDto>(
    dto: T,
    payment: SubscriptionPayment,
  ): T {
    return Object.assign(dto, {
      id: payment.id,
      number: payment.number,
      displayNumber: PaymentReference.format(payment.number),
      planName: payment.planName,
      billingPeriod: payment.billingPeriod,
      countryCode: payment.countryCode,
      currency: payment.currency,
      amount: MoneyUtils.format(payment.amount),
      provider: payment.provider,
      status: payment.status,
      method: payment.method,
      reference: payment.reference,
      failureReason: payment.failureReason,
      ownerComment: payment.ownerComment,
      expiresAt: payment.expiresAt,
      paidAt: payment.paidAt,
      periodStart: payment.periodStart,
      periodEnd: payment.periodEnd,
      createdByRole: payment.createdByRole,
      createdAt: payment.createdAt,
    });
  }
}
