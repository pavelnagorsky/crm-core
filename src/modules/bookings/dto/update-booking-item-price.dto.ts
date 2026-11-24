import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { IsNullablePrice } from '../../../shared/decorators/is-price.decorator.js';
import { BookingItemPromotionDto } from './booking-item-promotion.dto.js';

export class UpdateBookingItemPriceDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  id: string;

  @IsNullablePrice()
  customPrice: string | null;

  @ApiProperty({
    type: () => BookingItemPromotionDto,
    required: false,
    description:
      'Pick the discount of the item again: the item gets fresh price layers at its staff and time (send its current customPrice too). Missing: the stored layers are kept.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => BookingItemPromotionDto)
  promotion?: BookingItemPromotionDto;
}
