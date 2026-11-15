import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { IsCalendarDate } from '../../../shared/time/decorators/is-calendar-date.validator.js';
import { BillingReasonDto } from './billing-reason.dto.js';

export class ExtendTrialsDto extends BillingReasonDto {
  @ApiProperty({
    type: String,
    format: 'date',
    example: '2027-01-15',
    description:
      'New trial end (YYYY-MM-DD, exclusive) in each brand timezone. Applies to subscriptions without payments; a later trial end is kept',
  })
  @IsCalendarDate()
  until: string;

  @ApiPropertyOptional({
    default: false,
    description: 'Only count the brands that would change',
  })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
