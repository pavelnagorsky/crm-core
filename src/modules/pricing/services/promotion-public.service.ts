import { HttpStatus, Injectable } from '@nestjs/common';
import { PriceRuleKind, PromotionChannel } from '@prisma/client';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { LocationService } from '../../location/services/location.service.js';
import { StaffService } from '../../staff/services/staff.service.js';
import { PriceRuleRecord } from '../interfaces/price-rule-record.interface.js';
import { PublicPromotionView } from '../interfaces/public-promotion-view.interface.js';
import { toPricingRuleEntry } from '../rules/price-rule-entry.rules.js';
import { nextRuleDate } from '../rules/price-rule-schedule.rules.js';
import {
  buildPromotionConditions,
  promotionConditionsInput,
} from '../rules/promotion-conditions.rules.js';
import { PriceRuleCatalogService } from './price-rule-catalog.service.js';
import { PriceRuleReadService } from './price-rule-read.service.js';

const dateOf = (date: Date | null): string | null =>
  date ? TimeUtils.dateOnlyStr(date) : null;

/**
 * Promotions as clients see them (docs/pricing-stage4-api.md): the list of the booking page
 * and the shared promotion link. Conditions leave out "Осталось X из N": the remaining count
 * lives in bookings, which pricing does not read.
 */
@Injectable()
export class PromotionPublicService {
  constructor(
    private readonly reads: PriceRuleReadService,
    private readonly catalog: PriceRuleCatalogService,
    private readonly locations: LocationService,
    private readonly staff: StaffService,
  ) {}

  /**
   * Enabled live promotions shown as promotions, online, without a promo code, that are in
   * force today or start by `windowEnd` (the online booking window): their visit dates and
   * booking period are not over and a visit day falls in [today, windowEnd].
   */
  async listForBookingSetup(
    locationId: string,
    today: string,
    windowEnd: string,
  ): Promise<PublicPromotionView[]> {
    const rules = (await this.reads.listLivePromotions(locationId)).filter(
      (rule) =>
        rule.showAsPromotion &&
        rule.promoCode === null &&
        (rule.channels ?? []).includes(PromotionChannel.ONLINE) &&
        isCurrent(rule, today, windowEnd),
    );
    return this.toViews(locationId, rules);
  }

  /**
   * One promotion for the shared link, a promo code promotion too (the code is not
   * returned). 404 PROMOTION_NOT_FOUND when it is archived, disabled, of another location
   * or over.
   */
  async findPublic(
    locationId: string,
    promotionId: string,
    today: string,
  ): Promise<PublicPromotionView> {
    const rule = (await this.reads.listLivePromotions(locationId)).find(
      (item) => item.id === promotionId,
    );
    if (!rule || !isCurrent(rule, today, null))
      throw new AppException(
        ErrorCode.PROMOTION_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    return (await this.toViews(locationId, [rule]))[0];
  }

  /** The location "today", for callers that have only the location. */
  async locationToday(locationId: string, now = new Date()): Promise<string> {
    const { timezone } = await this.locations.getBookingSettings(locationId);
    return TimeUtils.zonedDateStr(now, timezone);
  }

  private async toViews(
    locationId: string,
    rules: readonly PriceRuleRecord[],
  ): Promise<PublicPromotionView[]> {
    if (rules.length === 0) return [];
    const [{ currency }, targets, staffNames] = await Promise.all([
      this.locations.getBookingSettings(locationId),
      this.catalog.nameTargets(
        locationId,
        rules.flatMap((rule) =>
          rule.targets.map((target) => ({
            type: target.targetType,
            id: target.targetId,
            excluded: target.excluded,
          })),
        ),
      ),
      this.staff.namesByIds([
        ...new Set(rules.flatMap((rule) => rule.staff.map((item) => item.staffId))),
      ]),
    ]);
    const nameOf = new Map(
      targets.map((target) => [`${target.type}:${target.id}`, target.name]),
    );
    return rules.map((rule) => ({
      id: rule.id,
      publicName: rule.publicName ?? rule.name,
      publicDescription: rule.publicDescription,
      valueType: rule.valueType,
      value: rule.value,
      clientFilter: rule.clientFilter,
      requiresCode: rule.promoCode !== null,
      conditions: buildPromotionConditions(
        promotionConditionsInput(rule, {
          targets: rule.targets.map((target) => ({
            name: nameOf.get(`${target.targetType}:${target.targetId}`) ?? null,
            excluded: target.excluded,
          })),
          staffNames: rule.staff.flatMap(({ staffId }) => {
            const name = staffNames.get(staffId);
            return name === undefined ? [] : [name];
          }),
          currency,
          usageCount: null,
        }),
      ),
      appliesToAll: rule.appliesToAll,
      targets: rule.targets.map((target) => ({
        type: target.targetType,
        id: target.targetId,
        excluded: target.excluded,
      })),
    }));
  }
}

/**
 * Not over: the booking period has not ended and a visit day is still ahead; with
 * `windowEnd`, that day must come by then and booking must have started by then.
 */
function isCurrent(
  rule: PriceRuleRecord,
  today: string,
  windowEnd: string | null,
): boolean {
  if (rule.kind !== PriceRuleKind.PROMOTION) return false;
  const bookingTo = dateOf(rule.bookingTo);
  const bookingFrom = dateOf(rule.bookingFrom);
  if (bookingTo !== null && bookingTo < today) return false;
  if (windowEnd !== null && bookingFrom !== null && bookingFrom > windowEnd)
    return false;
  const next = nextRuleDate(toPricingRuleEntry(rule), today);
  if (next === null) return false;
  return windowEnd === null || next <= windowEnd;
}
