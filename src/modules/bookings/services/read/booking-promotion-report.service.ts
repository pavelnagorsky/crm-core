import { Injectable } from '@nestjs/common';
import { PriceAdjustmentKind, Prisma } from '@prisma/client';
import { DatabaseService } from '../../../../database/database.service.js';
import { StaffService } from '../../../staff/services/staff.service.js';
import {
  PROMOTION_NOT_RETURNED_LIMIT,
  PROMOTION_RETURN_DAYS,
} from '../../../pricing/constants/price-rule.constants.js';
import { PromotionMatchItem } from '../../../pricing/interfaces/promotion-match-item.interface.js';
import { PromotionNotReturnedRow } from '../../../pricing/interfaces/promotion-not-returned-row.interface.js';
import { PromotionPeriodTotals } from '../../../pricing/interfaces/promotion-period-totals.interface.js';
import { PromotionReport } from '../../../pricing/interfaces/promotion-report.interface.js';
import { PromotionReportStaff } from '../../../pricing/interfaces/promotion-report-staff.interface.js';
import { BookingStatus } from '../../enums/booking-status.enum.js';
import { PromotionItemRow } from '../../interfaces/promotion-item-row.interface.js';
import { PromotionReturnCandidate } from '../../interfaces/promotion-return-candidate.interface.js';
import { PromotionStaffTotals } from '../../interfaces/promotion-staff-totals.interface.js';

const MS_PER_DAY = 86_400_000;
const ZERO = new Prisma.Decimal(0);
const LIVE_BOOKING = {
  status: { not: BookingStatus.CANCELLED },
  deletedAt: null,
} satisfies Prisma.BookingWhereInput;

/**
 * Results of promotions (docs/pricing-stage4-api.md, «Страница акции»). The base is live
 * bookings with a visit in the period (up to now) and an item with a PROMOTION layer of the
 * rule. The price layers of booking items are owned here.
 */
@Injectable()
export class BookingPromotionReportService {
  constructor(
    private readonly db: DatabaseService,
    private readonly staff: StaffService,
  ) {}

  /** One promotion over visits since `since` (null: all time) up to now. */
  async report(
    locationId: string,
    ruleId: string,
    since: Date | null,
    now: Date,
  ): Promise<PromotionReport> {
    const rows = await this.items(locationId, ruleId, since, now);
    const revenue = sum(rows.map(itemTotal));
    const discount = sum(rows.map((row) => row.discount));
    const bookings = new Set(rows.map((row) => row.bookingId));
    const clients = new Set(
      rows.flatMap((row) => (row.booking.clientId ? [row.booking.clientId] : [])),
    );
    const newClients = new Set(
      rows.flatMap((row) =>
        row.booking.acquiredClient ? [row.booking.acquiredClient.id] : [],
      ),
    );
    const candidates = returnCandidates(rows, now);
    const returned = await this.returnedClients(ruleId, candidates);
    const notReturned = candidates
      .filter((candidate) => !returned.has(candidate.clientId))
      .sort((a, b) => b.lastVisit.getTime() - a.lastVisit.getTime());
    return {
      revenue,
      discount,
      bookingsCount: bookings.size,
      clientsCount: clients.size,
      newClients: newClients.size,
      returningClients: clients.size - newClients.size,
      avgDiscount:
        bookings.size === 0
          ? ZERO
          : discount.div(bookings.size).toDecimalPlaces(2),
      returnedRate:
        candidates.length === 0
          ? null
          : Math.round((returned.size / candidates.length) * 10_000) / 10_000,
      staff: await this.staffRows(locationId, rows),
      notReturned: {
        count: notReturned.length,
        items: notReturned
          .slice(0, PROMOTION_NOT_RETURNED_LIMIT)
          .map((candidate) => {
            const last = lastItem(candidate);
            return {
              clientId: candidate.clientId,
              name: clientName(last),
              phone: last.booking.clientPhone,
              lastPromotionVisit: candidate.lastVisit,
            };
          }),
      },
    };
  }

  /** Every "not returned" client of all time, newest visit first, for the export. */
  async notReturnedRows(
    locationId: string,
    ruleId: string,
    now: Date,
  ): Promise<PromotionNotReturnedRow[]> {
    const rows = await this.items(locationId, ruleId, null, now);
    const candidates = returnCandidates(rows, now);
    const returned = await this.returnedClients(ruleId, candidates);
    return candidates
      .filter((candidate) => !returned.has(candidate.clientId))
      .sort((a, b) => b.lastVisit.getTime() - a.lastVisit.getTime())
      .map((candidate) => {
        const last = lastItem(candidate);
        const visitItems = candidate.items.filter(
          (item) => item.bookingId === last.bookingId,
        );
        return {
          name: clientName(last),
          phone: last.booking.clientPhone,
          email: last.booking.clientEmail,
          visitAt: candidate.lastVisit,
          staffNames: [...new Set(visitItems.map((item) => item.staffName))],
          serviceTitles: visitItems.map((item) => item.serviceTitle),
        };
      });
  }

  /** All promotions of the location over visits in [from, to]. */
  async periodTotals(
    locationId: string,
    from: Date,
    to: Date,
  ): Promise<PromotionPeriodTotals> {
    const layers = await this.db.bookingItemPriceAdjustment.findMany({
      where: {
        kind: PriceAdjustmentKind.PROMOTION,
        bookingItem: {
          locationId,
          startAt: { gte: from, lte: to },
          booking: LIVE_BOOKING,
        },
      },
      select: {
        amount: true,
        bookingItem: {
          select: {
            id: true,
            bookingId: true,
            chargedPrice: true,
            customPrice: true,
            booking: { select: { acquiredClient: { select: { id: true } } } },
          },
        },
      },
    });
    const items = new Map<string, Prisma.Decimal>();
    const bookings = new Set<string>();
    const clients = new Set<string>();
    let discount = ZERO;
    for (const layer of layers) {
      const item = layer.bookingItem;
      discount = discount.minus(layer.amount);
      items.set(item.id, item.customPrice ?? item.chargedPrice);
      bookings.add(item.bookingId);
      if (item.booking.acquiredClient) clients.add(item.booking.acquiredClient.id);
    }
    return {
      revenue: sum([...items.values()]),
      discount,
      bookingsCount: bookings.size,
      newClients: clients.size,
    };
  }

  /** Items of live bookings of the location with a visit start in [from, to]. */
  async matchItems(
    locationId: string,
    from: Date,
    to: Date,
  ): Promise<PromotionMatchItem[]> {
    const items = await this.db.bookingItem.findMany({
      where: {
        locationId,
        booking: { ...LIVE_BOOKING, startAt: { gte: from, lte: to } },
      },
      select: {
        bookingId: true,
        serviceId: true,
        staffId: true,
        listPrice: true,
        booking: { select: { startAt: true, channel: true, bundleId: true } },
      },
    });
    return items.map((item) => ({
      bookingId: item.bookingId,
      serviceId: item.serviceId,
      staffId: item.staffId,
      bundleId: item.booking.bundleId,
      visitStartAt: item.booking.startAt,
      channel: item.booking.channel,
      listPrice: item.listPrice,
    }));
  }

  private async items(
    locationId: string,
    ruleId: string,
    since: Date | null,
    now: Date,
  ): Promise<PromotionItemRow[]> {
    const items = await this.db.bookingItem.findMany({
      where: {
        locationId,
        startAt: { ...(since && { gte: since }), lte: now },
        booking: LIVE_BOOKING,
        priceAdjustments: {
          some: { kind: PriceAdjustmentKind.PROMOTION, ruleId },
        },
      },
      select: {
        id: true,
        bookingId: true,
        staffId: true,
        staffName: true,
        serviceTitle: true,
        startAt: true,
        chargedPrice: true,
        customPrice: true,
        priceAdjustments: {
          where: { kind: PriceAdjustmentKind.PROMOTION, ruleId },
          select: { amount: true },
        },
        booking: {
          select: {
            clientId: true,
            startAt: true,
            status: true,
            clientFirstName: true,
            clientLastName: true,
            clientPhone: true,
            clientEmail: true,
            acquiredClient: { select: { id: true } },
          },
        },
      },
      orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
    });
    return items.map(({ priceAdjustments, ...item }) => ({
      ...item,
      discount: sum(priceAdjustments.map((layer) => layer.amount)).negated(),
    }));
  }

  /**
   * Clients who booked again after their last completed promotion visit: a live booking in
   * the brand (clients are brand-level) starting later, without this promotion.
   */
  private async returnedClients(
    ruleId: string,
    candidates: readonly PromotionReturnCandidate[],
  ): Promise<Set<string>> {
    if (candidates.length === 0) return new Set();
    const earliest = new Date(
      Math.min(...candidates.map((candidate) => candidate.lastVisit.getTime())),
    );
    const later = await this.db.booking.findMany({
      where: {
        ...LIVE_BOOKING,
        clientId: { in: candidates.map((candidate) => candidate.clientId) },
        startAt: { gt: earliest },
        items: {
          none: {
            priceAdjustments: {
              some: { kind: PriceAdjustmentKind.PROMOTION, ruleId },
            },
          },
        },
      },
      select: { clientId: true, startAt: true },
    });
    const lastVisit = new Map(
      candidates.map((candidate) => [candidate.clientId, candidate.lastVisit]),
    );
    const returned = new Set<string>();
    for (const booking of later) {
      const visit = booking.clientId ? lastVisit.get(booking.clientId) : undefined;
      if (visit && booking.startAt > visit) returned.add(booking.clientId as string);
    }
    return returned;
  }

  private async staffRows(
    locationId: string,
    rows: readonly PromotionItemRow[],
  ): Promise<PromotionReportStaff[]> {
    const byStaff = new Map<string, PromotionStaffTotals>();
    for (const row of rows) {
      const entry = byStaff.get(row.staffId) ?? {
        name: row.staffName,
        bookings: new Set<string>(),
        revenue: ZERO,
        discount: ZERO,
      };
      entry.bookings.add(row.bookingId);
      entry.revenue = entry.revenue.plus(itemTotal(row));
      entry.discount = entry.discount.plus(row.discount);
      byStaff.set(row.staffId, entry);
    }
    if (byStaff.size === 0) return [];
    const staff = new Map(
      (await this.staff.listInLocation(locationId)).map((member) => [
        member.id,
        member,
      ]),
    );
    return [...byStaff.entries()]
      .map(([staffId, entry]) => ({
        staffId,
        name: staff.get(staffId)?.name ?? entry.name,
        avatarUrl: staff.get(staffId)?.avatarFile?.url ?? null,
        bookingsCount: entry.bookings.size,
        revenue: entry.revenue,
        discount: entry.discount,
      }))
      .sort(
        (a, b) =>
          b.bookingsCount - a.bookingsCount || a.name.localeCompare(b.name),
      );
  }
}

function sum(values: readonly Prisma.Decimal[]): Prisma.Decimal {
  return values.reduce((total, value) => total.plus(value), ZERO);
}

function itemTotal(row: PromotionItemRow): Prisma.Decimal {
  return row.customPrice ?? row.chargedPrice;
}

function clientName(row: PromotionItemRow): string {
  return [row.booking.clientFirstName, row.booking.clientLastName]
    .filter(Boolean)
    .join(' ');
}

/** Clients with a completed promotion visit at least 14 days before now, by their last one. */
function returnCandidates(
  rows: readonly PromotionItemRow[],
  now: Date,
): PromotionReturnCandidate[] {
  const cutoff = now.getTime() - PROMOTION_RETURN_DAYS * MS_PER_DAY;
  const byClient = new Map<string, PromotionReturnCandidate>();
  for (const row of rows) {
    const clientId = row.booking.clientId;
    if (!clientId || row.booking.status !== BookingStatus.COMPLETED) continue;
    if (row.booking.startAt.getTime() > cutoff) continue;
    const candidate = byClient.get(clientId) ?? {
      clientId,
      lastVisit: row.booking.startAt,
      items: [],
    };
    if (row.booking.startAt > candidate.lastVisit)
      candidate.lastVisit = row.booking.startAt;
    candidate.items.push(row);
    byClient.set(clientId, candidate);
  }
  return [...byClient.values()];
}

function lastItem(candidate: PromotionReturnCandidate): PromotionItemRow {
  return candidate.items.find(
    (item) => item.booking.startAt.getTime() === candidate.lastVisit.getTime(),
  ) as PromotionItemRow;
}
