import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { TrimString } from '../../../shared/transforms/trim-string.transform.js';
import { CreateOrderReturnItemDto } from './create-order-return-item.dto.js';
import { OrderReturnRefundDto } from './order-return-refund.dto.js';

export class CreateOrderReturnDto {
  @ApiProperty({ type: String, minLength: 1, maxLength: 100 })
  @IsString()
  @TrimString()
  @MinLength(1)
  @MaxLength(100)
  idempotencyKey: string;

  @ApiProperty({ type: String, minLength: 1, maxLength: 500 })
  @IsString()
  @TrimString()
  @MinLength(1)
  @MaxLength(500)
  reason: string;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @ApiProperty({ type: () => CreateOrderReturnItemDto, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderReturnItemDto)
  items: CreateOrderReturnItemDto[];

  @ApiProperty({
    type: () => OrderReturnRefundDto,
    required: false,
    description:
      'Money given back with the return, in one transaction. Amount: what was paid beyond the amount due after the return, at most the return total (money never received is not refunded); date: the return date (same bounds as a payment date, 400 PAYMENT_DATE_INVALID). Required when that amount is above 0 (400 ORDER_RETURN_REFUND_REQUIRED); ignored when it is 0. The method must have been paid at least that much (409 PAYMENT_REFUND_EXCEEDS_PAID with responseValue { paidAmount, method }). Part of the request hash.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => OrderReturnRefundDto)
  refund?: OrderReturnRefundDto;
}
