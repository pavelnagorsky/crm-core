import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsOptional, IsUUID } from 'class-validator';
import { MULTI_SERVICE_MAX_ITEMS } from '../../../shared/constants/multi-service.constants.js';

export class BookingResolveRequestDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    isArray: true,
    required: false,
    description: 'Service ids being booked. Mutually exclusive with bundleId.',
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MULTI_SERVICE_MAX_ITEMS)
  @IsUUID(undefined, { each: true })
  serviceIds?: string[];

  @ApiProperty({ type: String, format: 'uuid', required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  bundleId?: string;

  @ApiProperty({ type: String, format: 'uuid', required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  staffId?: string;
}
