import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';
import { IsOptionalPrice } from '../../../shared/decorators/is-price.decorator.js';
import { MULTI_SERVICE_MAX_ITEMS } from '../../../shared/constants/multi-service.constants.js';
import { BookingExecutionMode } from '../../bookings/enums/booking-execution-mode.enum.js';
import { ServiceStatus } from '../enums/service-status.enum.js';
import { BundlePricingMode } from '../enums/bundle-pricing-mode.enum.js';
import { CreateServiceBundleItemDto } from './create-service-bundle-item.dto.js';

export class CreateServiceBundleDto {
  @ApiProperty({ type: String, maxLength: 150 })
  @IsString()
  @MaxLength(150)
  title: string;

  @ApiProperty({ type: String, maxLength: 2000, required: false, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  imageFileId?: string;

  @ApiProperty({ enum: BookingExecutionMode, enumName: 'BookingExecutionMode', required: false })
  @IsOptional()
  @IsEnum(BookingExecutionMode)
  executionMode?: BookingExecutionMode;

  @ApiProperty({ enum: BundlePricingMode, enumName: 'BundlePricingMode', required: false })
  @IsOptional()
  @IsEnum(BundlePricingMode)
  pricingMode?: BundlePricingMode;

  @IsOptionalPrice()
  fixedPrice?: string;

  @ApiProperty({ enum: ServiceStatus, enumName: 'ServiceStatus', required: false })
  @IsOptional()
  @IsEnum(ServiceStatus)
  status?: ServiceStatus;

  @ApiProperty({ type: Number, required: false, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiProperty({ type: () => CreateServiceBundleItemDto, isArray: true })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(MULTI_SERVICE_MAX_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => CreateServiceBundleItemDto)
  items: CreateServiceBundleItemDto[];
}
