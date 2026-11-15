import { ApiProperty } from '@nestjs/swagger';
import { Matches, MaxLength } from 'class-validator';
import regularExpressions from '../../../shared/regular-expressions.js';
import { TrimString } from '../../../shared/transforms/trim-string.transform.js';

/** Query of plan-change-quote and body of plan-change. */
export class PlanChangeRequestDto {
  @ApiProperty({ example: 'team', maxLength: 50 })
  @TrimString()
  @Matches(regularExpressions.billingPlanCode)
  @MaxLength(50)
  planCode: string;
}
