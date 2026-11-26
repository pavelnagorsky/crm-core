import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ReadConsistency } from '../../../shared/cache/enums/read-consistency.enum.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { BookingsFacade } from '../../bookings/bookings.facade.js';
import { InventoryFacade } from '../../inventory/inventory.facade.js';
import { LocationService } from '../../location/services/location.service.js';
import { PriceAdjustmentKind } from '../engine/enums/price-adjustment-kind.enum.js';
import { ProductUnit } from '../engine/enums/product-unit.enum.js';
import { PromotionChannel } from '../engine/enums/promotion-channel.enum.js';
import { PriceAdjustment } from '../engine/interfaces/price-adjustment.interface.js';
import { PricingProductEntry } from '../engine/interfaces/pricing-product-entry.interface.js';
import { PricingSnapshot } from '../engine/interfaces/pricing-snapshot.interface.js';
import { QuoteContext } from '../engine/interfaces/quote-context.interface.js';
import { PriceBook } from '../engine/price-book.js';
import { PriceExplainRequestDto } from '../dto/price-explain-request.dto.js';
import { PriceExplainClientType } from '../enums/price-explain-client-type.enum.js';
import { PriceExplainKind } from '../enums/price-explain-kind.enum.js';
import { PriceExplainProductContext } from '../enums/price-explain-product-context.enum.js';
import { PriceExplain } from '../interfaces/price-explain.interface.js';
import { PriceExplainCandidate } from '../interfaces/price-explain-candidate.interface.js';
import { PriceExplainLine } from '../interfaces/price-explain-line.interface.js';
import { PricingFacade } from '../pricing.facade.js';
import { PricingContextService } from './pricing-context.service.js';
import { PricingSnapshotService } from './pricing-snapshot.service.js';

const QUANTITY_MILLI = 1000;

/**
 * The price check: why a service, bundle or product costs what it costs at a given local
 * time, and what each staff member would charge for a service. It prices through the same
 * price book as booking and sale, and for "any staff" asks the bookings module who the
 * location rule would assign at that time. Promotions and the client discount follow the
 * channel, the client, the promo code and the moment of booking of the request
 * (docs/pricing-stage4-api.md); a product is a separate sale or a product of a booking
 * (docs/pricing-stage7-api.md, «Проверка цены»).
 */
@Injectable()
export class PriceExplainService {
  constructor(
    private readonly snapshots: PricingSnapshotService,
    private readonly pricing: PricingFacade,
    private readonly bookings: BookingsFacade,
    private readonly pricingContext: PricingContextService,
    private readonly locations: LocationService,
    private readonly inventory: InventoryFacade,
  ) {}

  /**
   * `canReadPurchaseCost` (Read(INVENTORY)): a product's last purchase cost is returned as
   * a number; belowCost is computed either way.
   */
  async explain(
    locationId: string,
    dto: PriceExplainRequestDto,
    canReadPurchaseCost = false,
  ): Promise<PriceExplain> {
    const picked = [dto.serviceId, dto.bundleId, dto.productId].filter(
      (id) => id !== undefined,
    );
    if (picked.length !== 1)
      throw new BadRequestException(
        'Exactly one of serviceId, bundleId and productId is required',
      );
    if (dto.productId !== undefined)
      return this.explainProduct(
        locationId,
        dto.productId,
        dto,
        canReadPurchaseCost,
      );
    const snapshot = await this.snapshots.load(
      locationId,
      ReadConsistency.CACHED,
    );
    const book = new PriceBook(
      snapshot,
      TimeUtils.zonedDateStr(new Date(), snapshot.timezone),
    );
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

    const context = await this.context(locationId, dto);
    const staffing = await this.bookings.previewStaffing(locationId, {
      serviceIds,
      bundleId,
      staffId: dto.staffId,
      date: dto.date,
      time: dto.time,
      book,
      context,
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
      context,
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
      kind: PriceExplainKind.SERVICE,
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
      promoCode: explanation.quote.promoCode,
      lastPurchaseUnitCost: null,
      belowCost: false,
    };
  }

  /**
   * One product line: the retail price of one unit on the date, the line by the price list
   * for the quantity, the one best discount and the promotions that did not reach it.
   * 409 ORDER_PRODUCT_NOT_SELLABLE when the location does not sell the product.
   */
  private async explainProduct(
    locationId: string,
    productId: string,
    dto: PriceExplainRequestDto,
    canReadPurchaseCost: boolean,
  ): Promise<PriceExplain> {
    const snapshot = await this.snapshots.load(
      locationId,
      ReadConsistency.CACHED,
    );
    const product = snapshot.products.find(
      (item) => item.productId === productId,
    );
    if (!product)
      throw new AppException(
        ErrorCode.ORDER_PRODUCT_NOT_SELLABLE,
        HttpStatus.CONFLICT,
      );
    const seller = dto.staffId
      ? snapshot.staff.find((item) => item.id === dto.staffId)
      : null;
    if (seller === undefined)
      throw new AppException(
        ErrorCode.BOOKING_STAFF_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    const quantity = productQuantity(product, dto.quantity);
    const book = new PriceBook(
      snapshot,
      TimeUtils.zonedDateStr(new Date(), snapshot.timezone),
    );
    const context = await this.productContext(locationId, dto);
    const explanation = book.explainProduct(
      {
        productLocationId: product.productLocationId,
        quantityMilli: quantity.mul(QUANTITY_MILLI).toNumber(),
        customUnitPrice: null,
        sellerStaffId: seller?.id ?? null,
      },
      { date: dto.date, minute: TimeUtils.hhmmToMinutes(dto.time) },
      context,
      0,
    );
    const quoted = explanation.quote.lines[0];
    const costs = await this.inventory.lastPurchaseUnitCosts(locationId, [
      product.productLocationId,
    ]);
    const cost = costs.get(product.productLocationId) ?? null;
    const rulesById = new Map(snapshot.rules.map((rule) => [rule.id, rule]));
    return {
      kind: PriceExplainKind.PRODUCT,
      staffId: seller?.id ?? null,
      staffName: seller?.name ?? null,
      levelName: null,
      total: quoted.lineTotal,
      line: {
        basePrice: quoted.listUnitPrice,
        staffPrice: quoted.listUnitPrice,
        adjustments: quoted.adjustments,
        listPrice: quoted.listLineTotal,
        discount: quoted.discount,
        chargedPrice: quoted.lineTotal,
        total: quoted.lineTotal,
      },
      candidates: [],
      notApplied: explanation.notApplied.map((item) => ({
        ...item,
        intervals: rulesById.get(item.ruleId)?.intervals ?? [],
      })),
      promoCode: explanation.quote.promoCode,
      lastPurchaseUnitCost: canReadPurchaseCost ? cost : null,
      belowCost:
        cost !== null &&
        MoneyUtils.fromMinor(quoted.lineTotal).lt(
          MoneyUtils.quantize(cost.mul(quantity)),
        ),
    };
  }

  /**
   * Facts of a product line: a separate sale is sold at the desk (ADMIN) at the date and
   * time of the request, without a visit (lead time conditions give NO_VISIT); a product of
   * a booking takes the visit start, channel and booking moment like a service. The client
   * discount is the one on products.
   */
  private async productContext(
    locationId: string,
    dto: PriceExplainRequestDto,
  ): Promise<QuoteContext> {
    const { brandId, timezone } =
      await this.locations.getBookingSettings(locationId);
    const moment = TimeUtils.localToUtc(`${dto.date}T${dto.time}:00`, timezone);
    const sale =
      (dto.productContext ?? PriceExplainProductContext.SALE) ===
      PriceExplainProductContext.SALE;
    const common = {
      locationId,
      brandId,
      timezone,
      clientId: dto.clientId ?? null,
      promoCode: dto.promoCode ?? null,
    };
    const context = await this.pricingContext.build(
      sale
        ? {
            ...common,
            channel: PromotionChannel.ADMIN,
            visitStartAt: null,
            sale: true,
            now: moment,
          }
        : {
            ...common,
            channel: dto.channel ?? PromotionChannel.ONLINE,
            visitStartAt: moment,
            now: dto.bookedAt
              ? TimeUtils.localToUtc(dto.bookedAt, timezone)
              : undefined,
          },
    );
    return imagineClient(context, dto);
  }

  /** Booking facts of the check; without clientId, clientType imagines a known client. */
  private async context(
    locationId: string,
    dto: PriceExplainRequestDto,
  ): Promise<QuoteContext> {
    const context = await this.bookings.localPricingContext(locationId, {
      channel: dto.channel ?? PromotionChannel.ONLINE,
      visitStart: `${dto.date}T${dto.time}:00`,
      bookedAt: dto.bookedAt ?? null,
      clientId: dto.clientId ?? null,
      promoCode: dto.promoCode ?? null,
    });
    return imagineClient(context, dto);
  }
}

/** Without clientId, clientType imagines a known client, new or regular, without discounts. */
function imagineClient(
  context: QuoteContext,
  dto: PriceExplainRequestDto,
): QuoteContext {
  if (dto.clientId || !dto.clientType) return context;
  return {
    ...context,
    client: {
      known: true,
      isNew: dto.clientType === PriceExplainClientType.NEW,
      birthday: null,
      servicesDiscountBp: null,
      productsDiscountBp: null,
    },
  };
}

/** Quantity of the checked product: "1" by default, above 0, whole for a PIECE product. */
function productQuantity(
  product: PricingProductEntry,
  raw: string | undefined,
): Prisma.Decimal {
  const quantity = new Prisma.Decimal(raw ?? '1');
  if (
    quantity.lte(0) ||
    (product.unit === ProductUnit.PIECE && !quantity.isInteger())
  )
    throw new BadRequestException(
      'quantity must be above 0, whole for a product sold by the piece',
    );
  return quantity;
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
    chargedPrice: number;
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
  const adjustments = [...merged.values()];
  return {
    basePrice: sum((line) => line.basePrice),
    staffPrice: sum((line) => line.staffPrice),
    adjustments,
    listPrice: sum((line) => line.listPrice),
    discount:
      adjustments.find(
        (adjustment) =>
          adjustment.kind === PriceAdjustmentKind.PROMOTION ||
          adjustment.kind === PriceAdjustmentKind.CLIENT_DISCOUNT,
      ) ?? null,
    chargedPrice: sum((line) => line.chargedPrice),
    total: sum((line) => line.total),
  };
}
