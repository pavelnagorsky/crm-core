import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';
import { BillingReasonDto } from './billing-reason.dto.js';

export class ExtendTrialDto extends BillingReasonDto {
  @ApiProperty({
    minimum: 1,
    maximum: 365,
    example: 14,
    description:
      'Days added to the trial end; an ended trial is extended from today',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days: number;
}
