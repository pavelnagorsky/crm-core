import { HttpStatus, Injectable } from '@nestjs/common';
import { Booking, Prisma } from '@prisma/client';
import { ReadConsistency } from '../../../../shared/cache/enums/read-consistency.enum.js';
import { AppException } from '../../../../shared/exceptions/app.exception.js';
import { MoneyUtils } from '../../../../shared/money/money.utils.js';
import { ErrorCode } from '../../../../shared/validation/error-codes.enum.js';
import { LocationService } from '../../../location/services/location.service.js';
import { PriceAdjustmentKind } from '../../../pricing/engine/enums/price-adjustment-kind.enum.js';
import { PromoCodeStatus } from '../../../pricing/engine/enums/promo-code-status.enum.js';
import { PromotionChannel } from '../../../pricing/engine/enums/promotion-channel.enum.js';
import { LineDiscountChoice } from '../../../pricing/engine/interfaces/line-discount-choice.interface.js';
import { ServiceLinePrice } from '../../../pricing/interfaces/service-line-price.interface.js';
import { PromoCodeResult } from '../../../pricing/engine/interfaces/promo-code-result.interface.js';
import { PricingFacade } from '../../../pricing/pricing.facade.js';
import { UpdateBookingItemPriceDto } from '../../dto/update-booking-item-price.dto.js';
import { UpdateBookingDto } from '../../dto/update-booking.dto.js';
import { BookingRepricingMode } from '../../enums/booking-repricing-mode.enum.js';
import { BookingItemDiscountChoice } from '../../interfaces/booking-item-discount-choice.interface.js';
import { BookingRepricingRequest } from '../../interfaces/booking-repricing-request.interface.js';
import { BookingRepricing } from '../../interfaces/booking-repricing.interface.js';
import { BookingWithItems } from '../../interfaces/booking-with-items.interface.js';
import {
  discountChoiceHeld,
  promotionChannelOf,
  repeatedDiscountChoice,
  storedDiscountChoice,
} from '../../rules/booking-discount-choice.rules.js';
import { servicesTotal } from '../../rules/booking-services-total.rules.js';
import { visitTimeAt } from '../../rules/booking-visit-time.rules.js';
import { BookingPricingContextService } from '../booking-pricing-context.service.js';

/**
 * New prices of an existing booking (docs/pricing-stage4-api.md, docs/pricing-stage5-api.md),
 * always at the final staff and time of its items, so a move in the same request counts:
 * - a cabinet edit re-prices the items whose discount is picked again, every item when the
 *   promo code changes (or the booking is a bundle, priced as a whole), and every item with
 *   pricing RECALCULATE (checked against expectedTotal);
 * - a client moving the booking re-prices every item by the rules it was booked with.
 * Custom prices stay; a stored discount pick is applied again and reset to AUTO when its
 * discount no longer applies. The other items keep their layers; rule edits never touch
 * stored prices.
 */
@Injectable()
export class BookingRepricingService {
  constructor(
    private readonly pricing: PricingFacade,
    private readonly pricingContext: BookingPricingContextService,
    private readonly locations: LocationService,
  ) {}

  /**
   * A cabinet edit (PUT bookings/:id). `items` are at their final staff and time, `clientId`
   * is the client the edit leaves on the booking. Null when the edit changes no price.
   */
  async plan(
    old: BookingWithItems,
    dto: UpdateBookingDto,
    items: BookingWithItems['items'] = old.items,
    clientId: string | null = old.clientId,
  ): Promise<BookingRepricing | null> {
    const recalculate = dto.pricing === BookingRepricingMode.RECALCULATE;
    const patches = new Map(
      (dto.items ?? []).map((patch) => [patch.id, patch]),
    );
    const picked = (dto.items ?? []).some((patch) => patch.promotion);
    const promoCode =
      dto.promoCode !== undefined ? (dto.promoCode ?? null) : old.promoCode;
    const codeChanged = promoCode !== old.promoCode;
    if (!recalculate && !picked && !codeChanged) return null;

    const all = recalculate || codeChanged || old.bundleId !== null;
    const repricing = await this.reprice(old, {
      items,
      channel: PromotionChannel.ADMIN,
      clientId,
      promoCode,
      customPrice: (item) => {
        const patch = patches.get(item.id);
        if (!patch) return item.customPrice;
        return patch.customPrice == null
          ? null
          : new Prisma.Decimal(patch.customPrice);
      },
      choice: (item) => {
        const promotion = patches.get(item.id)?.promotion;
        return promotion
          ? { mode: promotion.mode, ruleId: promotion.ruleId ?? null }
          : repeatedDiscountChoice(item);
      },
      repriced: (item) => all || Boolean(patches.get(item.id)?.promotion),
      // An unchanged code stays as it was booked, unless everything is recalculated.
      keepPromoCode: !recalculate && !codeChanged,
      expectedTotal: recalculate ? dto.expectedTotal : undefined,
    });
    // A service deactivated or a bundle edited since booking: there is no current price.
    if (!repricing)
      throw new AppException(
        ErrorCode.BOOKING_REPRICE_UNAVAILABLE,
        HttpStatus.CONFLICT,
      );
    return repricing;
  }

  /**
   * A client moving the booking (`items` at the new time): every item re-priced both ways by
   * the rules the booking was made with - its channel, client, promo code and booking day.
   * A total other than `expectedTotal` (the price of the slot) is 409 PRICE_CHANGED. A booking
   * that cannot be priced any more (service deactivated, bundle edited) moves at its prices:
   * null, and expectedTotal is checked against its current total.
   */
  async planClientMove(
    old: BookingWithItems,
    items: BookingWithItems['items'],
    expectedTotal: string,
  ): Promise<BookingRepricing | null> {
    const repricing = await this.reprice(old, {
      items,
      channel: promotionChannelOf(old.channel),
      clientId: old.clientId,
      promoCode: old.promoCode,
      customPrice: (item) => item.customPrice,
      choice: repeatedDiscountChoice,
      repriced: () => true,
      keepPromoCode: false,
      expectedTotal,
      bookedAt: old.createdAt,
    });
    if (!repricing) {
      const ordered = this.ordered(items);
      this.assertExpectedTotal(
        expectedTotal,
        servicesTotal(ordered),
        ordered,
        ordered.map((item) => item.customPrice ?? item.chargedPrice),
        null,
      );
    }
    return repricing;
  }

  /**
   * What the edit writes to the booking: new layers (with the custom price) of re-priced
   * items, the custom price of the other patched items and the promo code.
   */
  bookingWrite(
    repricing: BookingRepricing | null,
    patches: readonly UpdateBookingItemPriceDto[] = [],
  ): Pick<Prisma.BookingUpdateInput, 'items' | 'promoCode'> {
    const repriced = new Set(repricing?.itemIds ?? []);
    const update = [
      ...patches
        .filter((patch) => !repriced.has(patch.id))
        .map((patch) => ({
          where: { id: patch.id },
          data: { customPrice: patch.customPrice },
        })),
      ...(repricing?.itemUpdates ?? []),
    ];
    return {
      ...(update.length > 0 && { items: { update } }),
      ...(repricing && { promoCode: repricing.promoCode }),
    };
  }

  /** In the write transaction: the limited promotions the new layers use still have room. */
  async holdLimits(
    tx: Prisma.TransactionClient,
    booking: Pick<Booking, 'id' | 'locationId'>,
    repricing: BookingRepricing | null,
  ): Promise<void> {
    if (!repricing) return;
    await this.pricingContext.assertLimitsHeld(
      tx,
      booking.locationId,
      repricing.ruleIds,
      repricing.clientId,
      repricing.visitStartAt,
      booking.id,
    );
  }

  /** Null when the booking cannot be priced now (see PricingFacade.canPrice). */
  private async reprice(
    old: BookingWithItems,
    request: BookingRepricingRequest,
  ): Promise<BookingRepricing | null> {
    const items = this.ordered(request.items);
    const book = await this.pricing.priceBook(
      old.locationId,
      ReadConsistency.FRESH,
    );
    if (
      !this.pricing.canPrice(
        book,
        old.bundleId,
        items.map((item) => item.serviceId),
      )
    )
      return null;
    const location = await this.locations.getBookingSettings(old.locationId);
    const visitStartAt = new Date(
      Math.min(...items.map((item) => item.startAt.getTime())),
    );
    const customPrices = items.map((item) => request.customPrice(item));
    const choices = items.map((item) => request.choice(item));
    const choice: Record<number, LineDiscountChoice> = {};
    choices.forEach((picked, index) => {
      if (picked) choice[index] = picked;
    });
    const context = await this.pricingContext.build({
      locationId: old.locationId,
      brandId: location.brandId,
      timezone: location.timezone,
      channel: request.channel,
      visitStartAt,
      clientId: request.clientId,
      promoCode: request.promoCode,
      choice,
      bookingId: old.id,
      bookedAt: request.bookedAt,
    });
    const quote = this.pricing.quoteWithBook(book, {
      bundleId: old.bundleId,
      lines: items.map((item, index) => ({
        serviceId: item.serviceId,
        staffId: item.staffId,
        customPrice: customPrices[index],
      })),
      visit: visitTimeAt(visitStartAt, location.timezone),
      context,
    });
    if (request.expectedTotal !== undefined)
      this.assertExpectedTotal(
        request.expectedTotal,
        quote.total,
        items,
        quote.lines.map((line) => line.customPrice ?? line.chargedPrice),
        quote.promoCode,
      );

    const repriced = items
      .map((item, index) => ({ item, index, line: quote.lines[index] }))
      .filter(({ item }) => request.repriced(item));
    return {
      itemIds: repriced.map(({ item }) => item.id),
      itemUpdates: repriced.map(({ item, index, line }) => ({
        where: { id: item.id },
        data: {
          basePrice: line.basePrice,
          staffPrice: line.staffPrice,
          listPrice: line.listPrice,
          discountTotal: line.discountTotal,
          chargedPrice: line.chargedPrice,
          customPrice: customPrices[index],
          priceAdjustments: { deleteMany: {}, create: line.adjustments },
          ...this.choiceWrite(choices[index], line),
        },
      })),
      promoCode: request.keepPromoCode
        ? request.promoCode
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
      clientId: request.clientId,
      visitStartAt,
    };
  }

  /** A new pick is stored; a stored one is reset to AUTO when its discount did not apply. */
  private choiceWrite(
    choice: LineDiscountChoice | undefined,
    line: ServiceLinePrice,
  ): Partial<BookingItemDiscountChoice> {
    if (!choice) return {};
    if (!choice.fallbackToAuto) return storedDiscountChoice(choice);
    return discountChoiceHeld(choice, line)
      ? {}
      : storedDiscountChoice(undefined);
  }

  /** Items in booking order: the order of the price lines. */
  private ordered(items: BookingWithItems['items']): BookingWithItems['items'] {
    return [...items].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
    );
  }

  /** As an online booking: the total the caller saw must still hold, else 409 PRICE_CHANGED. */
  private assertExpectedTotal(
    expected: string,
    total: Prisma.Decimal,
    items: BookingWithItems['items'],
    prices: Prisma.Decimal[],
    promoCode: PromoCodeResult | null,
  ): void {
    if (total.equals(expected)) return;
    throw new AppException(ErrorCode.PRICE_CHANGED, HttpStatus.CONFLICT, {
      expectedTotal: expected,
      total: MoneyUtils.format(total),
      items: items.map((item, index) => ({
        serviceId: item.serviceId,
        serviceTitle: item.serviceTitle,
        staffId: item.staffId,
        staffName: item.staffName,
        price: MoneyUtils.format(prices[index]),
      })),
      promoCode,
    });
  }
}
