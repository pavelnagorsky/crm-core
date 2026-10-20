import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { DashboardRangeDto } from '../../../dashboard/dto/dashboard-range.dto.js';
import { ProductsAnalyticsWidgetKey } from '../enums/products-analytics-widget-key.enum.js';

export class ProductsAnalyticsRequestDto extends DashboardRangeDto {
  @ApiProperty({ enum: ProductsAnalyticsWidgetKey, isArray: true })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @ArrayMaxSize(Object.keys(ProductsAnalyticsWidgetKey).length)
  @IsEnum(ProductsAnalyticsWidgetKey, { each: true })
  keys: ProductsAnalyticsWidgetKey[];

  @ApiProperty({
    type: String,
    format: 'uuid',
    isArray: true,
    required: false,
    description:
      'Active locations of this brand. Omit to include all active locations.',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  locationIds?: string[];

  @ApiProperty({ type: String, format: 'uuid', required: false })
  @IsOptional()
  @IsUUID()
  staffId?: string;

  @ApiProperty({ type: String, format: 'uuid', required: false })
  @IsOptional()
  @IsUUID()
  productId?: string;

  @ApiProperty({ type: String, format: 'uuid', required: false })
  @IsOptional()
  @IsUUID()
  categoryId?: string;
}
