import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { MULTI_SERVICE_MAX_ITEMS } from '../../services/constants/multi-service.constants.js';
import { ManualBookingItemDto } from './manual-booking-item.dto.js';
import { ManualBookingProductDto } from './manual-booking-product.dto.js';

export class BookingPricingRequestDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    deprecated: true,
  })
  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @ApiProperty({ type: String, format: 'uuid', isArray: true, required: false })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MULTI_SERVICE_MAX_ITEMS)
  @IsUUID(undefined, { each: true })
  serviceIds?: string[];

  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  bundleId?: string | null;

  @ApiProperty({
    type: () => ManualBookingItemDto,
    isArray: true,
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MULTI_SERVICE_MAX_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => ManualBookingItemDto)
  items?: ManualBookingItemDto[];

  @ApiProperty({
    type: () => ManualBookingProductDto,
    isArray: true,
    required: false,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ManualBookingProductDto)
  products?: ManualBookingProductDto[];
}
