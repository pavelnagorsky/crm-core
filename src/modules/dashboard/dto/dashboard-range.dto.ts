import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { DashboardPeriod } from '../enums/dashboard-period.enum.js';
import { SeriesGranularity } from '../enums/series-granularity.enum.js';

export class DashboardRangeDto {
  @ApiProperty({ enum: DashboardPeriod })
  @IsEnum(DashboardPeriod)
  period: DashboardPeriod;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiProperty({ type: String, format: 'date-time', required: false })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiProperty({ enum: SeriesGranularity, required: false })
  @IsOptional()
  @IsEnum(SeriesGranularity)
  groupBy?: SeriesGranularity;

  @ApiProperty({ type: Boolean, required: false, default: true })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase() === 'true' : Boolean(value)))
  @IsBoolean()
  compareWithPrevious?: boolean;

  @ApiProperty({ type: String, required: false, description: 'IANA timezone override; defaults to business timezone' })
  @IsOptional()
  @IsString()
  timezone?: string;
}
