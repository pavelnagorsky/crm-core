import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { OrderProductItemDto } from './order-product-item.dto.js';

export class AddOrderItemsDto {
  @ApiProperty({ type: () => OrderProductItemDto, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => OrderProductItemDto)
  items: OrderProductItemDto[];
}
