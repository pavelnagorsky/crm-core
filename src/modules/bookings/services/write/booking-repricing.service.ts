import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ReadConsistency } from '../../../../shared/cache/enums/read-consistency.enum.js';
import { LocationService } from '../../../location/services/location.service.js';
import { PriceAdjustmentKind } from '../../../pricing/engine/enums/price-adjustment-kind.enum.js';
import { PromoCodeStatus } from '../../../pricing/engine/enums/promo-code-status.enum.js';
import { PromotionChannel } from '../../../pricing/engine/enums/promotion-channel.enum.js';
import { LineDiscountChoice } from '../../../pricing/engine/interfaces/line-discount-choice.interface.js';
import { PricingFacade } from '../../../pricing/pricing.facade.js';
import { UpdateBookingDto } from '../../dto/update-booking.dto.js';
import { BookingRepricing } from '../../interfaces/booking-repricing.interface.js';
import { BookingWithItems } from '../../interfaces/booking-with-items.interface.js';
import { visitTimeAt } from '../../rules/booking-visit-time.rules.js';
import { BookingPricingContextService } from '../booking-pricing-context.service.js';

/**
 * Discounts changed in the booking dialog of an existing booking (docs/pricing-stage4-api.md):
 * a line whose discount is picked again, or every line when the promo code changes (or the
 * booking is a bundle, priced as a whole), gets fresh layers at its stored staff and time.
 * The other lines keep theirs; rule edits never touch stored prices.
 */
@Injectable()
export class BookingRepricingService {
  constructor(
    private readonly pricing: PricingFacade,
    private readonly pricingContext: BookingPricingContextService,
    private readonly locations: LocationService,
  ) {}

  /** Null when the edit changes no discount. */
  async plan(
    old: BookingWithItems,
    dto: UpdateBookingDto,
  ): Promise<BookingRepricing | null> {
    const patches = new Map((dto.items ?? []).map((patch) => [patch.id, patch]));
    const promotions = (dto.items ?? []).filter((patch) => patch.promotion);
    const promoCode =
      dto.promoCode !== undefined ? (dto.promoCode ?? null) : old.promoCode;
    const codeChanged = promoCode !== old.promoCode;
    if (promotions.length === 0 && !codeChanged) return null;

    const items = [...old.items].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
    );
    const location = await this.locations.getBookingSettings(old.locationId);
    const visitStartAt = new Date(
      Math.min(...items.map((item) => item.startAt.getTime())),
    );
    const customPrice = (item: BookingWithItems['items'][number]) => {
      const patch = patches.get(item.id);
      if (!patch) return item.customPrice;
      return patch.customPrice == null
        ? null
        : new Prisma.Decimal(patch.customPrice);
    };
    const choice: Record<number, LineDiscountChoice> = {};
    items.forEach((item, index) => {
      const promotion = patches.get(item.id)?.promotion;
      if (promotion)
        choice[index] = {
          mode: promotion.mode,
          ruleId: promotion.ruleId ?? null,
        };
    });
    const context = await this.pricingContext.build({
      locationId: old.locationId,
      brandId: location.brandId,
      timezone: location.timezone,
      channel: PromotionChannel.ADMIN,
      visitStartAt,
      clientId: old.clientId,
      promoCode,
      choice,
      bookingId: old.id,
    });
    const quote = await this.pricing.quoteServices(
      old.locationId,
      {
        bundleId: old.bundleId,
        lines: items.map((item) => ({
          serviceId: item.serviceId,
          staffId: item.staffId,
          customPrice: customPrice(item),
        })),
        visit: visitTimeAt(visitStartAt, location.timezone),
        context,
      },
      ReadConsistency.FRESH,
    );
    const all = codeChanged || old.bundleId !== null;
    const repriced = items
      .map((item, index) => ({ item, line: quote.lines[index] }))
      .filter(({ item }) => all || patches.get(item.id)?.promotion);
    return {
      itemIds: repriced.map(({ item }) => item.id),
      itemUpdates: repriced.map(({ item, line }) => ({
        where: { id: item.id },
        data: {
          basePrice: line.basePrice,
          staffPrice: line.staffPrice,
          listPrice: line.listPrice,
          discountTotal: line.discountTotal,
          chargedPrice: line.chargedPrice,
          customPrice: customPrice(item),
          priceAdjustments: { deleteMany: {}, create: line.adjustments },
        },
      })),
      // An unchanged code stays as it was booked.
      promoCode: !codeChanged
        ? old.promoCode
        : quote.promoCode?.status === PromoCodeStatus.APPLIED
          ? quote.promoCode.code
          : null,
      ruleIds: repriced.flatMap(({ line }) =>
        line.adjustments
          .filter(
            (adjustment) =>
              (adjustment.kind as string) === PriceAdjustmentKind.PROMOTION &&
              adjustment.ruleId !== null,
          )
          .map((adjustment) => adjustment.ruleId as string),
      ),
      visitStartAt,
    };
  }
}
