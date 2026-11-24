import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { IsOptionalPrice } from '../../../shared/decorators/is-price.decorator.js';
import { BookingItemPromotionDto } from './booking-item-promotion.dto.js';

export class ManualBookingItemDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  serviceId: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  staffId?: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptionalPrice()
  customPrice?: string;

  @ApiProperty({
    type: () => BookingItemPromotionDto,
    required: false,
    description:
      'Discount of the line; missing = AUTO (the best). A line with customPrice has no discount',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => BookingItemPromotionDto)
  promotion?: BookingItemPromotionDto;
}
