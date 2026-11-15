import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../../shared/validation/error-codes.enum.js';
import { LocationService } from '../../../location/services/location.service.js';
import { StaffService } from '../../../staff/services/staff.service.js';
import { EffectiveLimitsCalculator } from '../../compute/effective-limits.calculator.js';
import { BillingPlanWithPrices } from '../../interfaces/billing-plan-with-prices.interface.js';
import { BillingUsage } from '../../interfaces/billing-usage.interface.js';
import { EffectiveLimits } from '../../interfaces/effective-limits.interface.js';
import { SubscriptionAccessService } from '../../subscriptions/services/subscription-access.service.js';

/**
 * What a brand uses, counted by the owners of staff and locations (plan section 10.1).
 * Lives outside the core: StaffModule and LocationModule import the core themselves.
 */
@Injectable()
export class BillingUsageService {
  constructor(
    private readonly staff: StaffService,
    private readonly locations: LocationService,
    private readonly access: SubscriptionAccessService,
  ) {}

  async usage(brandId: string): Promise<BillingUsage> {
    const [staff, locations] = await Promise.all([
      this.staff.countActiveSeats(brandId),
      this.locations.countActive(brandId),
    ]);
    return { staff, locations };
  }

  async usageByBrands(brandIds: string[]): Promise<Map<string, BillingUsage>> {
    const [staff, locations] = await Promise.all([
      this.staff.countActiveSeatsByBrands(brandIds),
      this.locations.countActiveByBrands(brandIds),
    ]);
    return new Map(
      brandIds.map((id) => [
        id,
        { staff: staff.get(id) ?? 0, locations: locations.get(id) ?? 0 },
      ]),
    );
  }

  /** First self-serve plan that fits the usage; null means custom terms are needed. */
  async suggestedPlan(
    countryCode: string,
    usage: BillingUsage,
    now = new Date(),
  ): Promise<BillingPlanWithPrices | null> {
    return EffectiveLimitsCalculator.suggestedPlan(
      await this.access.selfServePlans(countryCode, now),
      usage,
    );
  }

  /** PLAN_USAGE_EXCEEDS_LIMITS when the brand does not fit the limits. */
  assertFits(limits: EffectiveLimits, usage: BillingUsage): void {
    if (EffectiveLimitsCalculator.fits(limits, usage)) return;
    throw new AppException(
      ErrorCode.PLAN_USAGE_EXCEEDS_LIMITS,
      HttpStatus.CONFLICT,
      EffectiveLimitsCalculator.exceedsPayload(limits, usage),
    );
  }
}
