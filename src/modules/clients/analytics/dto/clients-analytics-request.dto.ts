import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEnum,
} from 'class-validator';
import { DashboardRangeDto } from '../../../dashboard/dto/dashboard-range.dto.js';
import { ClientsAnalyticsWidgetKey } from '../enums/clients-analytics-widget-key.enum.js';

export class ClientsAnalyticsRequestDto extends DashboardRangeDto {
  @ApiProperty({ enum: ClientsAnalyticsWidgetKey, isArray: true })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @ArrayMaxSize(Object.keys(ClientsAnalyticsWidgetKey).length)
  @IsEnum(ClientsAnalyticsWidgetKey, { each: true })
  keys: ClientsAnalyticsWidgetKey[];
}
