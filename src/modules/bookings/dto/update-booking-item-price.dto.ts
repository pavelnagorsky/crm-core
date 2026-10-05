import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { IsNullablePrice } from '../../../shared/decorators/is-price.decorator.js';

export class UpdateBookingItemPriceDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  id: string;

  @IsNullablePrice()
  customPrice: string | null;
}
