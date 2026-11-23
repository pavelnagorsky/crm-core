import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common';
import { ReadConsistency } from '../../../shared/cache/enums/read-consistency.enum.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { BookingsFacade } from '../../bookings/bookings.facade.js';
import { PriceAdjustment } from '../engine/interfaces/price-adjustment.interface.js';
import { PricingSnapshot } from '../engine/interfaces/pricing-snapshot.interface.js';
import { PriceBook } from '../engine/price-book.js';
import { PriceExplainRequestDto } from '../dto/price-explain-request.dto.js';
import { PriceExplain } from '../interfaces/price-explain.interface.js';
import { PriceExplainCandidate } from '../interfaces/price-explain-candidate.interface.js';
import { PriceExplainLine } from '../interfaces/price-explain-line.interface.js';
import { PricingFacade } from '../pricing.facade.js';
import { PricingSnapshotService } from './pricing-snapshot.service.js';

/**
 * The price check: why a service or bundle costs what it costs at a given local time, and
 * what each staff member would charge. It prices through the same price book as booking, and
 * for "any staff" asks the bookings module who the location rule would assign at that time.
 */
@Injectable()
export class PriceExplainService {
  constructor(
    private readonly snapshots: PricingSnapshotService,
    private readonly pricing: PricingFacade,
    private readonly bookings: BookingsFacade,
  ) {}

  async explain(
    locationId: string,
    dto: PriceExplainRequestDto,
  ): Promise<PriceExplain> {
    if ((dto.serviceId === undefined) === (dto.bundleId === undefined))
      throw new BadRequestException(
        'Exactly one of serviceId and bundleId is required',
      );
    const snapshot = await this.snapshots.load(
      locationId,
      ReadConsistency.CACHED,
    );
    const book = new PriceBook(snapshot);
    const bundleId = dto.bundleId ?? null;
    const serviceIds =
      bundleId === null
        ? [dto.serviceId as string]
        : (book.bundle(bundleId)?.serviceIds ?? []);
    this.pricing.assertPriceable(book, bundleId, serviceIds);
    if (dto.staffId && !snapshot.staff.some((item) => item.id === dto.staffId))
      throw new AppException(
        ErrorCode.BOOKING_STAFF_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );

    const staffing = await this.bookings.previewStaffing(locationId, {
      serviceIds,
      bundleId,
      staffId: dto.staffId,
      date: dto.date,
      time: dto.time,
      book,
    });
    const visit = {
      date: dto.date,
      minute: TimeUtils.hhmmToMinutes(dto.time),
    };
    const quoteFor = (staffId: string | null) => ({
      bundleId,
      lines: serviceIds.map((serviceId) => ({
        serviceId,
        staffId,
        customPrice: null,
      })),
      visit,
    });
    const staffId = staffing.assignedStaffId;
    const explanation = book.explain(quoteFor(staffId));

    const free = new Set(staffing.freeStaffIds);
    const candidates = staffing.qualifiedStaffIds
      .flatMap((id): PriceExplainCandidate[] => {
        const member = snapshot.staff.find((item) => item.id === id);
        if (!member) return [];
        return [
          {
            staffId: id,
            name: member.name,
            levelName: levelNameOf(snapshot, id),
            personal: serviceIds.every(
              (serviceId) => member.servicePrices[serviceId] !== undefined,
            ),
            price: book.quote(quoteFor(id)).total,
            available: free.has(id),
          },
        ];
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const rulesById = new Map(snapshot.rules.map((rule) => [rule.id, rule]));
    return {
      staffId,
      staffName: snapshot.staff.find((item) => item.id === staffId)?.name ?? null,
      levelName: levelNameOf(snapshot, staffId),
      total: explanation.quote.total,
      line: sumLines(explanation.quote.lines),
      candidates,
      notApplied: explanation.notApplied.map((item) => ({
        ...item,
        intervals: rulesById.get(item.ruleId)?.intervals ?? [],
      })),
    };
  }
}

/** Level of a staff member; the default level name when none is set. */
function levelNameOf(
  snapshot: PricingSnapshot,
  staffId: string | null,
): string | null {
  const member = snapshot.staff.find((item) => item.id === staffId);
  if (!member) return null;
  const level = member.levelId
    ? snapshot.levels.find((item) => item.id === member.levelId)
    : snapshot.levels.find((item) => item.isDefault);
  return level?.name ?? null;
}

/** One line for the screen: a bundle is summed, equal adjustments are merged. */
function sumLines(
  lines: readonly {
    basePrice: number;
    staffPrice: number;
    listPrice: number;
    total: number;
    adjustments: PriceAdjustment[];
  }[],
): PriceExplainLine {
  const merged = new Map<string, PriceAdjustment>();
  for (const adjustment of lines.flatMap((line) => line.adjustments)) {
    const key = `${adjustment.kind}:${adjustment.ruleId}:${adjustment.title}`;
    const same = merged.get(key);
    merged.set(
      key,
      same ? { ...same, amount: same.amount + adjustment.amount } : adjustment,
    );
  }
  const sum = (pick: (line: (typeof lines)[number]) => number) =>
    lines.reduce((total, line) => total + pick(line), 0);
  return {
    basePrice: sum((line) => line.basePrice),
    staffPrice: sum((line) => line.staffPrice),
    adjustments: [...merged.values()],
    listPrice: sum((line) => line.listPrice),
    total: sum((line) => line.total),
  };
}
