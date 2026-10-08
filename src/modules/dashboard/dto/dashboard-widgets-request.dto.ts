import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import {
  catalogCategoryIdDescription,
  catalogItemIdDescription,
} from '../../bookings/utils/catalog-item-filter.js';
import { DashboardRangeDto } from './dashboard-range.dto.js';
import { DashboardWidgetKey } from '../enums/dashboard-widget-key.enum.js';

export class DashboardWidgetsRequestDto extends DashboardRangeDto {
  @ApiProperty({ enum: DashboardWidgetKey, isArray: true })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @ArrayMaxSize(30)
  @IsEnum(DashboardWidgetKey, { each: true })
  keys: DashboardWidgetKey[];

  @ApiProperty({ type: String, format: 'uuid', required: false })
  @IsOptional()
  @IsUUID()
  staffId?: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    description: catalogItemIdDescription,
  })
  @IsOptional()
  @IsUUID()
  catalogItemId?: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    description: catalogCategoryIdDescription,
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiProperty({
    type: Number,
    required: false,
    minimum: 1,
    maximum: 50,
    default: 5,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  topN?: number;
}
