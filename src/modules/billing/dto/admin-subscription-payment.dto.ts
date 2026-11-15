import { ApiProperty } from '@nestjs/swagger';
import { SubscriptionPayment } from '@prisma/client';
import { SubscriptionPaymentDto } from './subscription-payment.dto.js';

export class AdminSubscriptionPaymentDto extends SubscriptionPaymentDto {
  @ApiProperty({ format: 'uuid' })
  brandId: string;

  @ApiProperty({ type: String, nullable: true })
  brandName: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  planId: string | null;

  @ApiProperty({ type: String, nullable: true })
  externalId: string | null;

  @ApiProperty({ type: String, nullable: true })
  adminNote: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  confirmedAt: Date | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  createdById: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  confirmedById: string | null;

  @ApiProperty({
    type: Object,
    nullable: true,
    description: 'Raw provider data, for diagnostics',
  })
  providerData: unknown;

  static fromAdmin(
    payment: SubscriptionPayment,
    brandName: string | null,
  ): AdminSubscriptionPaymentDto {
    return Object.assign(
      SubscriptionPaymentDto.fill(new AdminSubscriptionPaymentDto(), payment),
      {
        brandId: payment.brandId,
        brandName,
        planId: payment.planId,
        externalId: payment.externalId,
        adminNote: payment.adminNote,
        confirmedAt: payment.confirmedAt,
        createdById: payment.createdById,
        confirmedById: payment.confirmedById,
        providerData: payment.providerData ?? null,
      },
    );
  }
}
