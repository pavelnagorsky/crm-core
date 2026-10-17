import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { TrimString } from '../../../shared/transforms/trim-string.transform.js';
import { OrderProductItemDto } from './order-product-item.dto.js';

export class CreateOrderDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  clientId?: string | null;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @ApiProperty({
    type: String,
    maxLength: 1000,
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @TrimString()
  @MaxLength(1000)
  note?: string | null;

  @ApiProperty({
    type: Boolean,
    required: false,
    description: 'Create and confirm all product items atomically.',
  })
  @IsOptional()
  @IsBoolean()
  confirmImmediately?: boolean;

  @ApiProperty({
    type: String,
    maxLength: 100,
    required: false,
    nullable: true,
    description:
      'Required when confirmImmediately is true. Reuse for retries of the same sale. A different request with the same key returns ORDER_IDEMPOTENCY_CONFLICT (409).',
  })
  @IsOptional()
  @IsString()
  @TrimString()
  @MaxLength(100)
  idempotencyKey?: string | null;

  @ApiProperty({ type: () => OrderProductItemDto, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => OrderProductItemDto)
  items: OrderProductItemDto[];
}
