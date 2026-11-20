import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsTimeZone } from 'class-validator';
import { DEFAULT_ADMIN_TIMEZONE } from '../constants/email-admin.constants.js';
import { EmailOverviewPeriod } from '../enums/email-overview-period.enum.js';

export class EmailOverviewRequestDto {
  @ApiPropertyOptional({
    enum: EmailOverviewPeriod,
    enumName: 'EmailOverviewPeriod',
    default: EmailOverviewPeriod.DAY,
    description: '24h: hourly chart; 7d and 30d: daily',
  })
  @IsOptional()
  @IsEnum(EmailOverviewPeriod)
  period: EmailOverviewPeriod = EmailOverviewPeriod.DAY;

  @ApiPropertyOptional({
    default: DEFAULT_ADMIN_TIMEZONE,
    description:
      'Chart buckets start at hour or midnight boundaries of this zone',
  })
  @IsOptional()
  @IsTimeZone()
  timezone: string = DEFAULT_ADMIN_TIMEZONE;
}
