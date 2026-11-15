import { ApiProperty } from '@nestjs/swagger';
import { BillingPlanUpdateResult } from '../interfaces/billing-plan-update-result.interface.js';
import { AdminBillingPlanDto } from './admin-billing-plan.dto.js';

export class BillingPlanUpdateResponseDto extends AdminBillingPlanDto {
  @ApiProperty({
    description:
      'Subscriptions on this plan whose usage is now above the plan limits',
  })
  overLimitSubscriptions: number;

  static fromResult(
    value: BillingPlanUpdateResult,
  ): BillingPlanUpdateResponseDto {
    return Object.assign(
      AdminBillingPlanDto.fill(new BillingPlanUpdateResponseDto(), value),
      { overLimitSubscriptions: value.overLimitSubscriptions },
    );
  }
}
