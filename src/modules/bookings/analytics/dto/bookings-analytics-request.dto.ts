import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { DashboardRangeDto } from '../../../dashboard/dto/dashboard-range.dto.js';
import { BookingsAnalyticsWidgetKey } from '../enums/bookings-analytics-widget-key.enum.js';

export class BookingsAnalyticsRequestDto extends DashboardRangeDto {
  @ApiProperty({ enum: BookingsAnalyticsWidgetKey, isArray: true })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @ArrayMaxSize(Object.keys(BookingsAnalyticsWidgetKey).length)
  @IsEnum(BookingsAnalyticsWidgetKey, { each: true })
  keys: BookingsAnalyticsWidgetKey[];

  @ApiProperty({ type: String, format: 'uuid', required: false })
  @IsOptional()
  @IsUUID()
  staffId?: string;
}
