import { ApiProperty } from '@nestjs/swagger';
import { PricingCatalog } from '../interfaces/pricing-catalog.interface.js';
import { PublicBillingPlanDto } from './public-billing-plan.dto.js';

export class PublicBillingPlansResponseDto {
  @ApiProperty({ example: 'RU', description: 'Requested country' })
  country: string;

  @ApiProperty({
    example: 'BY',
    description:
      'Country whose prices are shown: the requested one, or the default when it has no prices',
  })
  pricingCountry: string;

  @ApiProperty({ example: 'BYN' })
  currency: string;

  @ApiProperty({ example: 30 })
  trialDays: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 17,
    description: 'Largest yearly discount among the plans, for «до −17%»',
  })
  yearlyDiscountPercent: number | null;

  @ApiProperty({ type: () => PublicBillingPlanDto, isArray: true })
  plans: PublicBillingPlanDto[];

  static fromEntity(
    catalog: PricingCatalog,
    trialDays: number,
  ): PublicBillingPlansResponseDto {
    const plans = catalog.plans.map(PublicBillingPlanDto.fromEntity);
    const discounts = plans
      .map((p) => p.prices?.YEAR?.discountPercent ?? null)
      .filter((d): d is number => d !== null && d > 0);
    return Object.assign(new PublicBillingPlansResponseDto(), {
      country: catalog.country,
      pricingCountry: catalog.pricingCountry,
      currency: catalog.currency,
      trialDays,
      yearlyDiscountPercent: discounts.length ? Math.max(...discounts) : null,
      plans,
    });
  }
}
