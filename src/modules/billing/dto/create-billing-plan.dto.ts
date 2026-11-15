import { ApiProperty } from '@nestjs/swagger';
import { BillingPlanPricingMode } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import regularExpressions from '../../../shared/regular-expressions.js';
import { TrimString } from '../../../shared/transforms/trim-string.transform.js';

export class CreateBillingPlanDto {
  @ApiProperty({
    example: 'team',
    maxLength: 50,
    description: 'Stable code; never changes. Lowercase letters, digits, dash',
  })
  @TrimString()
  @Matches(regularExpressions.billingPlanCode)
  @MaxLength(50)
  code: string;

  @ApiProperty({ example: 'Команда', maxLength: 100 })
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 2, minimum: 0, maximum: 1000 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  position: number;

  @ApiProperty({ description: 'Shown on the pricing page and in plan choice' })
  @IsBoolean()
  isPublic: boolean;

  @ApiProperty({
    enum: BillingPlanPricingMode,
    enumName: 'BillingPlanPricingMode',
    description:
      'CUSTOM: limits and price are set by an admin per subscription',
  })
  @IsEnum(BillingPlanPricingMode)
  pricingMode: BillingPlanPricingMode;

  @ApiProperty({
    type: Number,
    nullable: true,
    minimum: 1,
    description: 'Staff seats; null is unlimited',
  })
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  staffLimit: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    minimum: 1,
    description: 'Locations; null is unlimited',
  })
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  locationLimit: number | null;
}
