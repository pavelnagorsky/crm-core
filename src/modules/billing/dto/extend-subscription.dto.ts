import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { IsCalendarDate } from '../../../shared/time/decorators/is-calendar-date.validator.js';
import { BillingReasonDto } from './billing-reason.dto.js';

/** «Продлить без оплаты»: exactly one of days and until. */
export class ExtendSubscriptionDto extends BillingReasonDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 3660, example: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3660)
  days?: number;

  @ApiPropertyOptional({
    type: String,
    format: 'date',
    example: '2027-02-01',
    description: 'New access end (YYYY-MM-DD, exclusive) in the brand timezone',
  })
  @IsOptional()
  @IsCalendarDate()
  until?: string;
}
