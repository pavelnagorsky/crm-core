import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { PaginationRequestDto } from '../../../shared/dto/pagination-request.dto.js';
import regularExpressions from '../../../shared/regular-expressions.js';
import { ParseBoolean } from '../../../shared/transforms/parse-boolean.transform.js';
import { ToArray } from '../../../shared/transforms/to-array.transform.js';
import { TrimString } from '../../../shared/transforms/trim-string.transform.js';
import { AdminSubscriptionOrderBy } from '../enums/admin-subscription-order-by.enum.js';
import { SubscriptionState } from '../enums/subscription-state.enum.js';

export class AdminSubscriptionsRequestDto extends PaginationRequestDto<AdminSubscriptionOrderBy> {
  @ApiPropertyOptional({
    enum: SubscriptionState,
    enumName: 'SubscriptionState',
    isArray: true,
    description:
      'Repeat the key: ?state=PAST_DUE&state=EXPIRED. FREE never matches: such brands have no subscription',
  })
  @IsOptional()
  @ToArray()
  @IsArray()
  @IsEnum(SubscriptionState, { each: true })
  state?: SubscriptionState[];

  @ApiPropertyOptional({ type: [String], example: ['team'] })
  @IsOptional()
  @ToArray()
  @IsArray()
  @Matches(regularExpressions.billingPlanCode, { each: true })
  planCode?: string[];

  @ApiPropertyOptional({ type: [String], example: ['BY'] })
  @IsOptional()
  @ToArray()
  @IsArray()
  @Matches(regularExpressions.countryCode, { each: true })
  countryCode?: string[];

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Access ends before, exclusive',
  })
  @IsOptional()
  @IsDateString()
  accessEndsBefore?: string;

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Access ends at or after, inclusive',
  })
  @IsOptional()
  @IsDateString()
  accessEndsAfter?: string;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @ParseBoolean()
  @IsBoolean()
  hasPendingPayment?: boolean;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'Usage is above the limits that apply now',
  })
  @IsOptional()
  @ParseBoolean()
  @IsBoolean()
  overLimit?: boolean;

  @ApiPropertyOptional({
    type: Boolean,
    description: 'No standard plan fits and no custom plan is assigned',
  })
  @IsOptional()
  @ParseBoolean()
  @IsBoolean()
  needsCustomPlan?: boolean;

  @ApiPropertyOptional({
    maxLength: 100,
    description: 'Brand name or owner email, partial match',
  })
  @TrimString()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({
    enum: AdminSubscriptionOrderBy,
    enumName: 'AdminSubscriptionOrderBy',
  })
  @IsOptional()
  @IsEnum(AdminSubscriptionOrderBy)
  declare orderBy?: AdminSubscriptionOrderBy;
}
