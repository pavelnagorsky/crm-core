import { ApiProperty } from '@nestjs/swagger';
import { BillingPlanPricingMode } from '@prisma/client';
import { ResolvedPlanPricing } from '../interfaces/resolved-plan-pricing.interface.js';
import { BillingPlanPricesDto } from './billing-plan-prices.dto.js';
import { BillingUpcomingPriceDto } from './billing-upcoming-price.dto.js';

export class PublicBillingPlanDto {
  @ApiProperty({ example: 'team' })
  code: string;

  @ApiProperty({ example: 'Команда' })
  name: string;

  @ApiProperty()
  position: number;

  @ApiProperty({
    enum: BillingPlanPricingMode,
    enumName: 'BillingPlanPricingMode',
  })
  pricingMode: BillingPlanPricingMode;

  @ApiProperty({ type: Number, nullable: true, description: 'null: unlimited' })
  staffLimit: number | null;

  @ApiProperty({ type: Number, nullable: true, description: 'null: unlimited' })
  locationLimit: number | null;

  @ApiProperty({
    type: () => BillingPlanPricesDto,
    nullable: true,
    description:
      'null for CUSTOM plans and plans without a price in the pricing country',
  })
  prices: BillingPlanPricesDto | null;

  @ApiProperty({ type: () => BillingUpcomingPriceDto, isArray: true })
  upcomingPrices: BillingUpcomingPriceDto[];

  static fromEntity(item: ResolvedPlanPricing): PublicBillingPlanDto {
    return Object.assign(new PublicBillingPlanDto(), {
      code: item.plan.code,
      name: item.plan.name,
      position: item.plan.position,
      pricingMode: item.plan.pricingMode,
      staffLimit: item.plan.staffLimit,
      locationLimit: item.plan.locationLimit,
      prices: item.prices ? BillingPlanPricesDto.fromEntity(item.prices) : null,
      upcomingPrices: item.upcoming.map(BillingUpcomingPriceDto.fromEntity),
    });
  }
}
