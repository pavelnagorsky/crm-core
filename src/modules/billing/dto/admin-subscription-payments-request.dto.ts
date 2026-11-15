import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  SubscriptionPaymentProvider,
  SubscriptionPaymentStatus,
} from '@prisma/client';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationRequestDto } from '../../../shared/dto/pagination-request.dto.js';
import { ToArray } from '../../../shared/transforms/to-array.transform.js';
import { TrimString } from '../../../shared/transforms/trim-string.transform.js';
import { SubscriptionPaymentOrderBy } from '../enums/subscription-payment-order-by.enum.js';

export class AdminSubscriptionPaymentsRequestDto extends PaginationRequestDto<SubscriptionPaymentOrderBy> {
  @ApiPropertyOptional({
    enum: SubscriptionPaymentStatus,
    enumName: 'SubscriptionPaymentStatus',
    isArray: true,
    description:
      'Repeat the key: ?status=PENDING&status=EXPIRED. The "waiting" queue is status=PENDING',
  })
  @IsOptional()
  @ToArray()
  @IsArray()
  @IsEnum(SubscriptionPaymentStatus, { each: true })
  status?: SubscriptionPaymentStatus[];

  @ApiPropertyOptional({
    enum: SubscriptionPaymentProvider,
    enumName: 'SubscriptionPaymentProvider',
    isArray: true,
  })
  @IsOptional()
  @ToArray()
  @IsArray()
  @IsEnum(SubscriptionPaymentProvider, { each: true })
  provider?: SubscriptionPaymentProvider[];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  brandId?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Created at or after, inclusive',
  })
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Created before, exclusive',
  })
  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @ApiPropertyOptional({
    maxLength: 50,
    description: 'Payment number: "KL-000123", "KL123" or "123"',
  })
  @TrimString()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  search?: string;

  @ApiPropertyOptional({
    enum: SubscriptionPaymentOrderBy,
    enumName: 'SubscriptionPaymentOrderBy',
  })
  @IsOptional()
  @IsEnum(SubscriptionPaymentOrderBy)
  declare orderBy?: SubscriptionPaymentOrderBy;
}
