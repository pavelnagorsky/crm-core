import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { CreateOrderReturnItemDto } from './create-order-return-item.dto.js';

export class OrderReturnPreviewRequestDto {
  @ApiProperty({ type: () => CreateOrderReturnItemDto, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderReturnItemDto)
  items: CreateOrderReturnItemDto[];
}
