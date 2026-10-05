import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsOptional, IsUUID } from 'class-validator';
import { MULTI_SERVICE_MAX_ITEMS } from '../../../shared/constants/multi-service.constants.js';
import { ToArray } from '../../../shared/transforms/to-array.transform.js';

export class AvailableSlotsRequestDto {
  @ApiProperty({ type: String, description: 'Service UUID', required: false, deprecated: true })
  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @ApiProperty({ type: String, isArray: true, required: false, description: 'Service UUIDs' })
  @IsOptional()
  @ToArray()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MULTI_SERVICE_MAX_ITEMS)
  @IsUUID(undefined, { each: true })
  serviceIds?: string[];

  @ApiProperty({ type: String, required: false, nullable: true, description: 'Bundle UUID' })
  @IsOptional()
  @IsUUID()
  bundleId?: string;

  @ApiProperty({ type: String, required: false, nullable: true, description: 'Staff UUID. Omit for auto-assign to least-loaded staff.' })
  @IsOptional()
  @IsUUID()
  staffId?: string;
}
