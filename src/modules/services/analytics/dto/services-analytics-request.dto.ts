import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEnum,
} from 'class-validator';
import { DashboardRangeDto } from '../../../dashboard/dto/dashboard-range.dto.js';
import { ServicesAnalyticsWidgetKey } from '../enums/services-analytics-widget-key.enum.js';

export class ServicesAnalyticsRequestDto extends DashboardRangeDto {
  @ApiProperty({ enum: ServicesAnalyticsWidgetKey, isArray: true })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @ArrayMaxSize(Object.keys(ServicesAnalyticsWidgetKey).length)
  @IsEnum(ServicesAnalyticsWidgetKey, { each: true })
  keys: ServicesAnalyticsWidgetKey[];
}
