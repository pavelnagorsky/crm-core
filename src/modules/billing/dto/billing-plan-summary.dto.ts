import { ApiProperty } from '@nestjs/swagger';
import { BillingPlan, BillingPlanPricingMode } from '@prisma/client';

export class BillingPlanSummaryDto {
  @ApiProperty({ example: 'team' })
  code: string;

  @ApiProperty({ example: 'Команда' })
  name: string;

  @ApiProperty({
    enum: BillingPlanPricingMode,
    enumName: 'BillingPlanPricingMode',
  })
  pricingMode: BillingPlanPricingMode;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Plan limit; null: unlimited',
  })
  staffLimit: number | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Plan limit; null: unlimited',
  })
  locationLimit: number | null;

  static fromEntity(plan: BillingPlan): BillingPlanSummaryDto {
    return Object.assign(new BillingPlanSummaryDto(), {
      code: plan.code,
      name: plan.name,
      pricingMode: plan.pricingMode,
      staffLimit: plan.staffLimit,
      locationLimit: plan.locationLimit,
    });
  }
}
