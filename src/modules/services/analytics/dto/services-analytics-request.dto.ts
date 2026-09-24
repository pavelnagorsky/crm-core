import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { DashboardRangeDto } from '../../../dashboard/dto/dashboard-range.dto.js';
import { ServiceStatus } from '../../enums/service-status.enum.js';
import { ServicesAnalyticsWidgetKey } from '../enums/services-analytics-widget-key.enum.js';

export class ServicesAnalyticsRequestDto extends DashboardRangeDto {
  @ApiProperty({ enum: ServicesAnalyticsWidgetKey, isArray: true })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @ArrayMaxSize(Object.keys(ServicesAnalyticsWidgetKey).length)
  @IsEnum(ServicesAnalyticsWidgetKey, { each: true })
  keys: ServicesAnalyticsWidgetKey[];

  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiProperty({ enum: ServiceStatus, enumName: 'ServiceStatus', required: false })
  @IsOptional()
  @IsEnum(ServiceStatus)
  status?: ServiceStatus;
}
