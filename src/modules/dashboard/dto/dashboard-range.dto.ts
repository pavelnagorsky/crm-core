import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { IsCalendarDate } from '../../../shared/time/decorators/is-calendar-date.validator.js';
import { DashboardPeriod } from '../enums/dashboard-period.enum.js';
import { SeriesGranularity } from '../enums/series-granularity.enum.js';

export class DashboardRangeDto {
  @ApiProperty({ enum: DashboardPeriod })
  @IsEnum(DashboardPeriod)
  period: DashboardPeriod;

  @ApiProperty({
    type: String,
    format: 'date',
    required: false,
    description:
      'CUSTOM period only. First calendar day (YYYY-MM-DD) in the location timezone, inclusive.',
  })
  @IsOptional()
  @IsCalendarDate()
  from?: string;

  @ApiProperty({
    type: String,
    format: 'date',
    required: false,
    description:
      'CUSTOM period only. Last calendar day (YYYY-MM-DD) in the location timezone, inclusive.',
  })
  @IsOptional()
  @IsCalendarDate()
  to?: string;

  @ApiProperty({ enum: SeriesGranularity, required: false })
  @IsOptional()
  @IsEnum(SeriesGranularity)
  groupBy?: SeriesGranularity;

  @ApiProperty({ type: Boolean, required: false, default: true })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toLowerCase() === 'true' : Boolean(value),
  )
  @IsBoolean()
  compareWithPrevious?: boolean;

  @ApiProperty({
    type: String,
    required: false,
    description: 'IANA timezone override; defaults to business timezone',
  })
  @IsOptional()
  @IsString()
  timezone?: string;
}
