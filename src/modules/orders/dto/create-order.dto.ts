import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
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
    description: 'Required when confirmImmediately is true.',
  })
  @IsOptional()
  @IsString()
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
