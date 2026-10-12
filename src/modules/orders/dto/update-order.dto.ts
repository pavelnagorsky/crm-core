import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { TrimString } from '../../../shared/transforms/trim-string.transform.js';
import { UpdateOrderItemDto } from './update-order-item.dto.js';

export class UpdateOrderDto {
  @ApiProperty({
    type: Number,
    minimum: 1,
    description: 'Optimistic concurrency version from the latest order read.',
  })
  @IsInt()
  @Min(1)
  version: number;

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

  @ApiProperty({ type: () => UpdateOrderItemDto, isArray: true })
  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => UpdateOrderItemDto)
  items: UpdateOrderItemDto[];
}
