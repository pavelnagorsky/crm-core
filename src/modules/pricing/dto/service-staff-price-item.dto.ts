import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { IsNullablePrice } from '../../../shared/decorators/is-price.decorator.js';

export class ServiceStaffPriceItemDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  staffId: string;

  @IsNullablePrice()
  price: string | null;
}
