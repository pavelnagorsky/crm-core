import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationRequestDto } from '../../../shared/dto/pagination-request.dto.js';
import { SubscriptionPaymentOrderBy } from '../enums/subscription-payment-order-by.enum.js';

export class SubscriptionPaymentsRequestDto extends PaginationRequestDto<SubscriptionPaymentOrderBy> {
  @ApiPropertyOptional({
    enum: SubscriptionPaymentOrderBy,
    enumName: 'SubscriptionPaymentOrderBy',
  })
  @IsOptional()
  @IsEnum(SubscriptionPaymentOrderBy)
  declare orderBy?: SubscriptionPaymentOrderBy;
}
