import { HttpStatus, Injectable } from '@nestjs/common';
import {
  Location,
  OrderItemStatus,
  OrderItemType,
  OrderStatus,
  Prisma,
} from '@prisma/client';
import { ReadConsistency } from '../../../shared/cache/enums/read-consistency.enum.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { TimeUtils } from '../../../shared/time/time.utils.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { BookingVisitsService } from '../../bookings/visits/services/booking-visits.service.js';
import { LocationService } from '../../location/services/location.service.js';
import { PromoCodeResultDto } from '../../pricing/dto/promo-code-result.dto.js';
import { PromotionChannel } from '../../pricing/engine/enums/promotion-channel.enum.js';
import { LineDiscountChoice } from '../../pricing/engine/interfaces/line-discount-choice.interface.js';
import { QuoteContext } from '../../pricing/engine/interfaces/quote-context.interface.js';
import { VisitTime } from '../../pricing/engine/interfaces/visit-time.interface.js';
import { PriceBook } from '../../pricing/engine/price-book.js';
import { ProductPriceQuote } from '../../pricing/interfaces/product-price-quote.interface.js';
import { PromotionNotApplicable } from '../../pricing/interfaces/promotion-not-applicable.interface.js';
import { PricingFacade } from '../../pricing/pricing.facade.js';
import { PricingContextService } from '../../pricing/services/pricing-context.service.js';
import { OrderWithItems } from '../interfaces/order-with-items.interface.js';
import { ProductPricingLineInput } from '../interfaces/product-pricing-line-input.interface.js';
import {
  ProductPricingScope,
  ProductPricingVisit,
} from '../interfaces/product-pricing-scope.interface.js';
import { DraftRepricingOptions } from '../interfaces/draft-repricing-options.interface.js';
import { RepricedDrafts } from '../interfaces/repriced-drafts.interface.js';
import {
  confirmedProductListTotal,
  productPriceData,
  sameProductPrice,
  storedChoice,
} from '../rules/order-product-price.rules.js';
import { OrderPersistenceService } from './order-persistence.service.js';

type OrderLine = OrderWithItems['items'][number];

/**
 * Prices of the product lines of orders (docs/pricing-stage7-api.md): the context of a line
 * (visit or sale), the pricing core, the draft lines stored again on every write that touches
 * them, and the fresh pricing of a confirmation.
 */
@Injectable()
export class OrderProductPricingService {
  constructor(
    private readonly pricing: PricingFacade,
    private readonly pricingContext: PricingContextService,
    private readonly locations: LocationService,
    private readonly visits: BookingVisitsService,
    private readonly persistence: OrderPersistenceService,
  ) {}

  /**
   * Context of the product lines of an order: the visit of a visit order, otherwise the sale
   * (its client and promo code, sold now unless `sale.at` says otherwise).
   */
  async scopeOfOrder(
    order: OrderWithItems,
    location: Pick<Location, 'id' | 'brandId' | 'timezone'>,
    client: Prisma.TransactionClient,
    sale: { at?: Date; clientId?: string | null; promoCode?: string | null } = {},
  ): Promise<ProductPricingScope> {
    const base = {
      locationId: location.id,
      brandId: location.brandId,
      timezone: location.timezone,
      orderId: order.id,
      confirmedListTotal: confirmedProductListTotal(order.items),
    };
    if (order.bookingId) {
      const facts = await this.visits.pricingFacts(
        client,
        location.id,
        order.bookingId,
      );
      if (facts)
        return {
          ...base,
          visit: {
            bookingId: facts.bookingId,
            startAt: facts.startAt,
            bookedAt: facts.createdAt,
            channel: facts.channel,
            clientId: facts.clientId,
            promoCode: facts.promoCode,
            servicesListTotal: facts.servicesListTotal,
          },
          sale: null,
        };
    }
    return {
      ...base,
      visit: null,
      sale: {
        at: sale.at ?? new Date(),
        clientId: sale.clientId === undefined ? order.clientId : sale.clientId,
        promoCode:
          sale.promoCode === undefined ? order.promoCode : sale.promoCode,
      },
    };
  }

  /**
   * Locks the limited promotions of the location before the order (and the booking) of a
   * confirmation: see PricingContextService.lockLimits for the lock order.
   */
  lockLimits(tx: Prisma.TransactionClient, locationId: string): Promise<void> {
    return this.pricingContext.lockLimits(tx, locationId);
  }

  /**
   * The draft product lines of a visit order priced in a visit context the caller is about
   * to write (a booking edit: new start, client or promo code), with their stored picks.
   * Nothing is stored. Null without an active visit order with sellable drafts.
   */
  async quoteVisitDrafts(
    location: Pick<Location, 'id' | 'brandId' | 'timezone'>,
    visit: ProductPricingVisit & { bookingId: string },
  ): Promise<ProductPriceQuote | null> {
    const order = await this.persistence.inTransaction((tx) =>
      this.persistence.findForBookingInTransaction(
        tx,
        location.id,
        visit.bookingId,
      ),
    );
    if (!order || order.status !== OrderStatus.ACTIVE) return null;
    const book = await this.pricing.priceBook(
      location.id,
      ReadConsistency.CACHED,
    );
    const drafts = order.items.filter(
      (item) =>
        item.type === OrderItemType.PRODUCT &&
        item.status === OrderItemStatus.DRAFT &&
        item.productLocationId !== null &&
        book.hasProduct(item.productLocationId),
    );
    if (drafts.length === 0) return null;
    return this.quote(
      {
        locationId: location.id,
        brandId: location.brandId,
        timezone: location.timezone,
        orderId: order.id,
        visit,
        sale: null,
        confirmedListTotal: confirmedProductListTotal(order.items),
      },
      drafts.map((item) => this.lineInput(item, storedChoice(item))),
      ReadConsistency.CACHED,
      undefined,
      book,
    );
  }

  /** Product lines of the scope priced together. */
  async quote(
    scope: ProductPricingScope,
    lines: readonly ProductPricingLineInput[],
    consistency: ReadConsistency,
    tx?: Prisma.TransactionClient,
    book?: PriceBook,
  ): Promise<ProductPriceQuote> {
    const priceBook =
      book ?? (await this.pricing.priceBook(scope.locationId, consistency));
    return this.pricing.quoteProductsWithBook(priceBook, {
      lines: lines.map((line) => ({
        productLocationId: line.productLocationId,
        quantity: line.quantity,
        customUnitPrice: line.customUnitPrice,
        sellerStaffId: line.sellerStaffId,
      })),
      time: this.time(scope),
      // Only a confirmation (fresh prices) locks the limited promotions: drafts are no use.
      context: await this.context(
        scope,
        lines,
        tx,
        consistency === ReadConsistency.FRESH,
      ),
      otherListTotal: (
        scope.visit?.servicesListTotal ?? MoneyUtils.decimal(0)
      ).plus(scope.confirmedListTotal),
    });
  }

  /**
   * Prices every draft product line of the order again and stores what changed: money,
   * choice and layers. A line keeps its stored choice (a pick that stopped applying gives the
   * best discount) unless `explicit` (by product id; drafts have one line per product) sends
   * a new one, which must apply (409 PROMOTION_NOT_APPLICABLE with the request index from
   * `lineIndexOf`, also by product id). Lines whose product
   * is no longer sold keep their stored price: confirming them fails anyway. Totals are not
   * refreshed: the caller does that once after all of its writes.
   */
  async repriceDrafts(
    tx: Prisma.TransactionClient,
    locationId: string,
    orderId: string,
    options: DraftRepricingOptions = {},
  ): Promise<RepricedDrafts> {
    const order = await this.persistence.findInTransaction(
      tx,
      locationId,
      orderId,
    );
    const consistency = options.consistency ?? ReadConsistency.CACHED;
    const book = await this.pricing.priceBook(locationId, consistency);
    const drafts = order.items.filter(
      (item) =>
        item.type === OrderItemType.PRODUCT &&
        item.status === OrderItemStatus.DRAFT &&
        item.productLocationId !== null &&
        book.hasProduct(item.productLocationId),
    );
    if (drafts.length === 0)
      return { order, quote: null, lines: [], repricedIds: [] };
    const location = await this.locations.findById(locationId, tx);
    const scope = await this.scopeOfOrder(order, location, tx, {
      at: options.saleAt,
    });
    const inputs = drafts.map((item) =>
      this.lineInput(
        item,
        options.explicit?.has(item.catalogItemId!)
          ? options.explicit.get(item.catalogItemId!)!
          : storedChoice(item),
      ),
    );
    const quote = await this.withRequestIndex(
      () => this.quote(scope, inputs, consistency, tx, book),
      drafts,
      options.lineIndexOf,
    );
    const repricedIds: string[] = [];
    for (const [index, item] of drafts.entries()) {
      const data = productPriceData(quote.lines[index], inputs[index].choice);
      if (sameProductPrice(item, data)) continue;
      repricedIds.push(item.id);
      await tx.orderItem.update({
        where: { id: item.id },
        data: {
          ...data.fields,
          priceAdjustments: { deleteMany: {}, create: data.adjustments },
        },
      });
    }
    return {
      order,
      quote,
      lines: drafts.map((item, index) => ({ item, price: quote.lines[index] })),
      repricedIds,
    };
  }

  /**
   * Prices the draft lines of an order with fresh data under the locks of the limited
   * promotions (the caller's transaction) and stores them; the confirmed ones must add up to
   * `expectedTotal`, else 409 PRICE_CHANGED and everything rolls back. Returns the ids of
   * confirmed lines whose total differs from the draft.
   */
  async priceForConfirmation(
    tx: Prisma.TransactionClient,
    locationId: string,
    orderId: string,
    confirmedIds: readonly string[],
    expectedTotal: Prisma.Decimal,
    options: Omit<DraftRepricingOptions, 'consistency'> = {},
  ): Promise<string[]> {
    const before = await this.persistence.findInTransaction(
      tx,
      locationId,
      orderId,
    );
    const storedTotals = new Map(
      before.items.map((item) => [item.id, item.lineTotal]),
    );
    const repriced = await this.repriceDrafts(tx, locationId, orderId, {
      ...options,
      consistency: ReadConsistency.FRESH,
    });
    const targets = new Set(confirmedIds);
    const confirmed = repriced.lines.filter(({ item }) => targets.has(item.id));
    const total = confirmed.reduce(
      (sum, { price }) => sum.plus(price.lineTotal),
      MoneyUtils.decimal(0),
    );
    if (!total.equals(expectedTotal))
      throw new AppException(ErrorCode.PRICE_CHANGED, HttpStatus.CONFLICT, {
        expectedTotal: MoneyUtils.format(expectedTotal),
        total: MoneyUtils.format(total),
        products: confirmed.map(({ item, price }) => ({
          orderItemId: item.id,
          productId: item.catalogItemId,
          title: item.title,
          quantity: item.quantity.toFixed(3),
          listLineTotal: MoneyUtils.format(price.listLineTotal),
          discountTotal: MoneyUtils.format(price.discountTotal),
          lineTotal: MoneyUtils.format(price.lineTotal),
        })),
        promoCode: PromoCodeResultDto.fromResult(repriced.quote?.promoCode),
      });
    return confirmed
      .filter(
        ({ item, price }) => !storedTotals.get(item.id)?.equals(price.lineTotal),
      )
      .map(({ item }) => item.id);
  }

  /** Request line of a stored draft line. */
  lineInput(
    item: OrderLine,
    choice: LineDiscountChoice | null,
  ): ProductPricingLineInput {
    return {
      productLocationId: item.productLocationId!,
      productId: item.catalogItemId!,
      quantity: item.quantity,
      customUnitPrice: item.customUnitPrice,
      sellerStaffId: item.sellerStaffId,
      choice,
    };
  }

  /** PROMOTION_NOT_APPLICABLE of a line names its index in the request, not in the quote. */
  private async withRequestIndex<T>(
    operation: () => Promise<T>,
    drafts: readonly OrderLine[],
    lineIndexOf?: ReadonlyMap<string, number>,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (
        error instanceof AppException &&
        error.errorCode === ErrorCode.PROMOTION_NOT_APPLICABLE.code &&
        lineIndexOf
      ) {
        const payload = error.payload as PromotionNotApplicable;
        const item = drafts[payload.lineIndex];
        const lineIndex = item
          ? lineIndexOf.get(item.catalogItemId!)
          : undefined;
        if (lineIndex !== undefined)
          throw new AppException(
            ErrorCode.PROMOTION_NOT_APPLICABLE,
            HttpStatus.CONFLICT,
            { ...payload, lineIndex },
          );
      }
      throw error;
    }
  }

  /** Date and minute of the line: the visit start or the sale moment, local. */
  private time(scope: ProductPricingScope): VisitTime {
    const at = scope.visit
      ? (scope.visit.startAt ?? new Date())
      : scope.sale!.at;
    return {
      date: TimeUtils.zonedDateStr(at, scope.timezone),
      minute: TimeUtils.dateToMinutes(at, scope.timezone),
    };
  }

  private context(
    scope: ProductPricingScope,
    lines: readonly ProductPricingLineInput[],
    tx?: Prisma.TransactionClient,
    lockLimits = true,
  ): Promise<QuoteContext> {
    const choice: Record<number, LineDiscountChoice> = {};
    lines.forEach((line, index) => {
      if (line.choice) choice[index] = line.choice;
    });
    const common = {
      locationId: scope.locationId,
      brandId: scope.brandId,
      timezone: scope.timezone,
      orderId: scope.orderId,
      choice,
      tx,
      lockLimits,
    };
    if (scope.visit)
      return this.pricingContext.build({
        ...common,
        channel: scope.visit.channel,
        visitStartAt: scope.visit.startAt,
        clientId: scope.visit.clientId,
        phone: scope.visit.phone ?? null,
        promoCode: scope.visit.promoCode,
        bookingId: scope.visit.bookingId,
        bookedAt: scope.visit.bookedAt,
      });
    const sale = scope.sale!;
    return this.pricingContext.build({
      ...common,
      channel: PromotionChannel.ADMIN,
      visitStartAt: null,
      clientId: sale.clientId,
      promoCode: sale.promoCode,
      sale: true,
      now: sale.at,
      bookedAt: sale.at,
    });
  }
}
