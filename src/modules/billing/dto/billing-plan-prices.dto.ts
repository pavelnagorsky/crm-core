import { ApiProperty } from '@nestjs/swagger';
import { BillingPeriod } from '@prisma/client';
import { BillingPriceCalculator } from '../compute/billing-price.calculator.js';
import { PlanPeriodPrices } from '../interfaces/plan-period-prices.interface.js';
import { BillingPeriodPriceDto } from './billing-period-price.dto.js';

export class BillingPlanPricesDto {
  @ApiProperty({ type: () => BillingPeriodPriceDto, nullable: true })
  MONTH: BillingPeriodPriceDto | null;

  @ApiProperty({ type: () => BillingPeriodPriceDto, nullable: true })
  YEAR: BillingPeriodPriceDto | null;

  static fromEntity(prices: PlanPeriodPrices): BillingPlanPricesDto {
    const discount = BillingPriceCalculator.discountPercent(
      prices.MONTH?.amount ?? null,
      prices.YEAR?.amount ?? null,
    );
    return Object.assign(new BillingPlanPricesDto(), {
      MONTH: prices.MONTH
        ? BillingPeriodPriceDto.fromEntity(
            prices.MONTH,
            BillingPeriod.MONTH,
            null,
          )
        : null,
      YEAR: prices.YEAR
        ? BillingPeriodPriceDto.fromEntity(
            prices.YEAR,
            BillingPeriod.YEAR,
            discount,
          )
        : null,
    });
  }
}
