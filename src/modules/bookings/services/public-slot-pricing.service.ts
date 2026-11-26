import { Injectable } from '@nestjs/common';
import { AnyStaffRule } from '@prisma/client';
import { ReadConsistency } from '../../../shared/cache/enums/read-consistency.enum.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { assignStaff } from '../../../shared/scheduling/assign-staff.js';
import { CalendarFacade } from '../../calendar/calendar.facade.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { LocationService } from '../../location/services/location.service.js';
import { PriceAdjustmentKind } from '../../pricing/engine/enums/price-adjustment-kind.enum.js';
import { PromotionChannel } from '../../pricing/engine/enums/promotion-channel.enum.js';
import { LineDiscountChoice } from '../../pricing/engine/interfaces/line-discount-choice.interface.js';
import { QuoteContext } from '../../pricing/engine/interfaces/quote-context.interface.js';
import { QuoteLineRequest } from '../../pricing/engine/interfaces/quote-line-request.interface.js';
import { VisitTime } from '../../pricing/engine/interfaces/visit-time.interface.js';
import { PriceBook } from '../../pricing/engine/price-book.js';
import { PricingFacade } from '../../pricing/pricing.facade.js';
import { PublicAvailableSlotsRequestDto } from '../dto/public-available-slots-request.dto.js';
import { BookingWithItems } from '../interfaces/booking-with-items.interface.js';
import { PricedSlot } from '../interfaces/priced-slot.interface.js';
import { PricedSlotsDay } from '../interfaces/priced-slots-day.interface.js';
import { StaffRankCandidate } from '../interfaces/staff-rank-candidate.interface.js';
import {
  promotionChannelOf,
  repeatedDiscountChoice,
} from '../rules/booking-discount-choice.rules.js';
import { servicesTotal } from '../rules/booking-services-total.rules.js';
import { visitTimeOfSlot } from '../rules/booking-visit-time.rules.js';
import { rankStaff } from '../rules/staff-ranking.rules.js';
import { PricingContextService } from '../../pricing/services/pricing-context.service.js';
import { BookingStaffLoadService } from './booking-staff-load.service.js';

/**
 * Public slots with prices. The calendar lists who is free for each item at each start; this
 * service ranks them with the location's "any staff" rule (the same ranking booking creation
 * uses), assigns the team, and prices the visit with the staff it assigns at the slot start
 * (surcharges included), so a slot shows the price of the staff member the booking will get.
 * Ranking stays by staff price: surcharges depend only on the start, equal for every candidate.
 * Promotions (docs/pricing-stage4-api.md) price slots for an unknown online client, with the
 * promo code of the request; when the location has any, candidates rank by their discounted
 * price at each start, since a promotion may be limited to staff.
 *
 * A client who chose a staff member (staffId or staffAssignments) is served by the calendar
 * itself: only that member is free for the item, so the ranking has one candidate.
 *
 * When the location turns "any staff" off (Location.anyStaffEnabled = false) availability is
 * unchanged for a request without a chosen staff member and the slots are still priced by the
 * rule. The booking page then asks for a staff choice before it asks for a time; the setup
 * response carries the flag.
 *
 * Reads are bounded and do not depend on the number of slots: one price book, one calendar
 * read, one day-load groupBy over the range and, for ROUND_ROBIN only, one last-assignment query.
 */
@Injectable()
export class PublicSlotPricingService {
  constructor(
    private readonly calendar: CalendarFacade,
    private readonly pricing: PricingFacade,
    private readonly locations: LocationService,
    private readonly staffLoad: BookingStaffLoadService,
    private readonly pricingContext: PricingContextService,
  ) {}

  async getSlots(
    locationId: string,
    dto: PublicAvailableSlotsRequestDto,
  ): Promise<PricedSlotsDay[]> {
    const [offers, location, book] = await Promise.all([
      this.calendar.getPublicSlotOffers(locationId, dto),
      this.locations.getBookingSettings(locationId),
      this.pricing.priceBook(locationId, ReadConsistency.CACHED),
    ]);
    if (offers.days.length === 0) return [];

    const bundleId = dto.bundleId ?? null;
    const serviceIds = offers.items.map((item) => item.serviceId);
    this.pricing.assertPriceable(book, bundleId, serviceIds);

    const rule = location.anyStaffRule;
    const parallel = offers.executionMode === 'PARALLEL';
    const staffIds = [
      ...new Set(
        offers.days.flatMap((day) =>
          day.slots.flatMap((slot) => slot.freeStaffIds.flat()),
        ),
      ),
    ];
    const [loads, lastAssigned] = await Promise.all([
      this.staffLoad.dayLoads(
        locationId,
        staffIds,
        offers.days[0].date,
        offers.days[offers.days.length - 1].date,
        location.timezone,
      ),
      rule === AnyStaffRule.ROUND_ROBIN
        ? this.staffLoad.lastAssignedAt(locationId, staffIds)
        : new Map<string, number>(),
    ]);

    // An unknown online client: only promotions without client conditions, and the code.
    const context: QuoteContext | null =
      book.promotionRules().length > 0
        ? await this.pricingContext.build({
            locationId,
            brandId: location.brandId,
            timezone: location.timezone,
            channel: PromotionChannel.ONLINE,
            visitStartAt: null,
            promoCode: dto.promoCode ?? null,
          })
        : null;
    const slotContext = (date: string, time: string): QuoteContext | null =>
      context && {
        ...context,
        visitStartMs: TimeUtils.localToUtc(
          `${date}T${time}:00`,
          location.timezone,
        ).getTime(),
      };

    // Without promotions a candidate costs the same at every start.
    const priceCache = new Map<string, number>();
    const priceOf = (
      serviceId: string,
      staffId: string,
      visit: VisitTime,
      atSlot: QuoteContext | null,
    ): number => {
      const key = atSlot
        ? `${serviceId}:${staffId}:${visit.date}:${visit.minute}`
        : `${serviceId}:${staffId}`;
      let price = priceCache.get(key);
      if (price === undefined) {
        price = book.candidatePrice(serviceId, staffId, bundleId, visit, atSlot);
        priceCache.set(key, price);
      }
      return price;
    };

    return offers.days.map((day) => ({
      date: day.date,
      slots: day.slots.flatMap((slot) => {
        const visit = visitTimeOfSlot(day.date, slot.time);
        const atSlot = slotContext(day.date, slot.time);
        const team = assignStaff(
          slot.freeStaffIds.map((free, index) => ({
            itemId: String(index),
            staffIds: rankStaff(
              free.map((id): StaffRankCandidate => ({
                id,
                busy: false,
                price: priceOf(serviceIds[index], id, visit, atSlot),
                dayLoad: loads.get(id)?.get(day.date) ?? 0,
                lastAssignedAt: lastAssigned.get(id) ?? null,
              })),
              rule,
            ),
          })),
          parallel,
        );
        // The calendar offers a start only when a team exists; this guards a changed rule set.
        if (!team) return [];
        const assigned = serviceIds.map((_, index) => team.get(String(index))!);
        return [
          {
            time: slot.time,
            ...this.visitPrice(
              book,
              bundleId,
              serviceIds.map((serviceId, index) => ({
                serviceId,
                staffId: assigned[index],
                customPrice: null,
              })),
              visit,
              atSlot,
            ),
            staffIds: assigned,
          },
        ];
      }),
    }));
  }

  /**
   * Times a client can move a booking to (docs/pricing-stage5-api.md), each priced as the
   * booking would be there: its services, staff and custom prices, its client, promo code and
   * channel (MANUAL is ADMIN), the stored discount picks, promotions by the day it was booked,
   * the lead time from now and the limits without this booking.
   */
  async getRescheduleSlots(
    booking: BookingWithItems,
    from: string,
    to: string,
  ): Promise<PricedSlotsDay[]> {
    const [days, location, book] = await Promise.all([
      this.calendar.getRescheduleSlots(
        booking.locationId,
        booking.items,
        from,
        to,
      ),
      this.locations.getBookingSettings(booking.locationId),
      this.pricing.priceBook(booking.locationId, ReadConsistency.CACHED),
    ]);
    if (days.length === 0) return [];

    const items = [...booking.items].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
    );
    const lines: QuoteLineRequest[] = items.map((item) => ({
      serviceId: item.serviceId,
      staffId: item.staffId,
      customPrice:
        item.customPrice === null ? null : MoneyUtils.toMinor(item.customPrice),
    }));
    const staffIds = items.map((item) => item.staffId);
    // A service deactivated or a bundle edited since booking: the move keeps the prices.
    if (
      !this.pricing.canPrice(
        book,
        booking.bundleId,
        lines.map((line) => line.serviceId),
      )
    ) {
      const price = servicesTotal(items);
      return days.map((day) => ({
        date: day.date,
        slots: day.slots.map((slot) => ({
          time: slot.time,
          price,
          listPrice: null,
          promotionId: null,
          staffIds,
        })),
      }));
    }
    const choice: Record<number, LineDiscountChoice> = {};
    items.forEach((item, index) => {
      const stored = repeatedDiscountChoice(item);
      if (stored) choice[index] = stored;
    });
    // The per-client limit window is counted around the current start; the move re-checks it.
    const context = await this.pricingContext.build({
      locationId: booking.locationId,
      brandId: location.brandId,
      timezone: location.timezone,
      channel: promotionChannelOf(booking.channel),
      visitStartAt: booking.startAt,
      clientId: booking.clientId,
      promoCode: booking.promoCode,
      choice,
      bookingId: booking.id,
      bookedAt: booking.createdAt,
    });
    return days.map((day) => ({
      date: day.date,
      slots: day.slots.map((slot) => ({
        time: slot.time,
        ...this.visitPrice(
          book,
          booking.bundleId,
          lines,
          visitTimeOfSlot(day.date, slot.time),
          {
            ...context,
            visitStartMs: TimeUtils.localToUtc(
              `${day.date}T${slot.time}:00`,
              location.timezone,
            ).getTime(),
          },
        ),
        staffIds,
      })),
    }));
  }

  private visitPrice(
    book: PriceBook,
    bundleId: string | null,
    lines: QuoteLineRequest[],
    visit: VisitTime,
    context: QuoteContext | null,
  ): Pick<PricedSlot, 'price' | 'listPrice' | 'promotionId'> {
    const { total, lines: quoted } = book.quote({
      bundleId,
      lines,
      visit,
      context,
    });
    // A promotion not shown as one is just the price; a shown one gets the old price.
    const shown = quoted
      .map((line) => line.discount)
      .filter(
        (discount) =>
          discount !== null &&
          discount.kind === PriceAdjustmentKind.PROMOTION &&
          discount.publicTitle !== null,
      );
    const shownAmount = shown.reduce(
      (sum, discount) => sum - (discount?.amount ?? 0),
      0,
    );
    return {
      price: MoneyUtils.fromMinor(total),
      listPrice: shownAmount > 0 ? MoneyUtils.fromMinor(total + shownAmount) : null,
      promotionId: shown[0]?.ruleId ?? null,
    };
  }
}
