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
}
