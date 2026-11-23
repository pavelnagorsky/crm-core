import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { IsNullablePrice } from '../../../shared/decorators/is-price.decorator.js';

export class ServiceLevelPriceItemDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  levelId: string;

  @IsNullablePrice()
  price: string | null;
}
