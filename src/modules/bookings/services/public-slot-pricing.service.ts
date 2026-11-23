import { Injectable } from '@nestjs/common';
import { AnyStaffRule } from '@prisma/client';
import { ReadConsistency } from '../../../shared/cache/enums/read-consistency.enum.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { assignStaff } from '../../../shared/scheduling/assign-staff.js';
import { CalendarFacade } from '../../calendar/calendar.facade.js';
import { AvailableSlotsRequestDto } from '../../calendar/dto/available-slots-request.dto.js';
import { LocationService } from '../../location/services/location.service.js';
import { VisitTime } from '../../pricing/engine/interfaces/visit-time.interface.js';
import { PriceBook } from '../../pricing/engine/price-book.js';
import { PricingFacade } from '../../pricing/pricing.facade.js';
import { PricedSlotsDay } from '../interfaces/priced-slots-day.interface.js';
import { StaffRankCandidate } from '../interfaces/staff-rank-candidate.interface.js';
import { visitTimeOfSlot } from '../rules/booking-visit-time.rules.js';
import { rankStaff } from '../rules/staff-ranking.rules.js';
import { BookingStaffLoadService } from './booking-staff-load.service.js';

/**
 * Public slots with prices. The calendar lists who is free for each item at each start; this
 * service ranks them with the location's "any staff" rule (the same ranking booking creation
 * uses), assigns the team, and prices the visit with the staff it assigns at the slot start
 * (surcharges included), so a slot shows the price of the staff member the booking will get.
 * Ranking stays by staff price: surcharges depend only on the start, equal for every candidate.
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
  ) {}

  async getSlots(
    locationId: string,
    dto: AvailableSlotsRequestDto,
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

    const priceCache = new Map<string, number>();
    const priceOf = (serviceId: string, staffId: string): number => {
      const key = `${serviceId}:${staffId}`;
      let price = priceCache.get(key);
      if (price === undefined) {
        price = book.candidatePrice(serviceId, staffId, bundleId);
        priceCache.set(key, price);
      }
      return price;
    };

    return offers.days.map((day) => ({
      date: day.date,
      slots: day.slots.flatMap((slot) => {
        const team = assignStaff(
          slot.freeStaffIds.map((free, index) => ({
            itemId: String(index),
            staffIds: rankStaff(
              free.map((id): StaffRankCandidate => ({
                id,
                busy: false,
                price: priceOf(serviceIds[index], id),
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
            price: this.visitPrice(
              book,
              bundleId,
              serviceIds,
              assigned,
              visitTimeOfSlot(day.date, slot.time),
            ),
            staffIds: assigned,
          },
        ];
      }),
    }));
  }

  private visitPrice(
    book: PriceBook,
    bundleId: string | null,
    serviceIds: readonly string[],
    staffIds: readonly string[],
    visit: VisitTime,
  ) {
    const { total } = book.quote({
      bundleId,
      lines: serviceIds.map((serviceId, index) => ({
        serviceId,
        staffId: staffIds[index],
        customPrice: null,
      })),
      visit,
    });
    return MoneyUtils.fromMinor(total);
  }
}
