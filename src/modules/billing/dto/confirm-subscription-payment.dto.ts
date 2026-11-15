import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SubscriptionPaymentMethod } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { TrimString } from '../../../shared/transforms/trim-string.transform.js';

/** «Оплачено»: the amount and currency are the request snapshot. */
export class ConfirmSubscriptionPaymentDto {
  @ApiProperty({
    type: String,
    format: 'date-time',
    description:
      'When the money was paid: not in the future, not before the day of the request. The paid period counts from it',
  })
  @IsDateString()
  paidAt: string;

  @ApiProperty({
    enum: SubscriptionPaymentMethod,
    enumName: 'SubscriptionPaymentMethod',
  })
  @IsEnum(SubscriptionPaymentMethod)
  method: SubscriptionPaymentMethod;

  @ApiPropertyOptional({
    maxLength: 255,
    description: 'Bank or ERIP reference',
  })
  @TrimString()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reference?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @TrimString()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminNote?: string;
}
