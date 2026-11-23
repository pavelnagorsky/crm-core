import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { IsNullablePrice } from '../../../shared/decorators/is-price.decorator.js';

export class StaffServicePriceItemDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  serviceId: string;

  @IsNullablePrice()
  price: string | null;
}
