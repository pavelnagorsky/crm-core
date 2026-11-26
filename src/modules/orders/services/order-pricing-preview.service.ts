import {
  BadRequestException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderItemStatus,
  OrderItemType,
  Prisma,
  ProductUnit,
} from '@prisma/client';
import { ReadConsistency } from '../../../shared/cache/enums/read-consistency.enum.js';
import { DatabaseService } from '../../../database/database.service.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { AuditActorRole } from '../../audit/enums/audit-actor-role.enum.js';
import { BookingVisitsService } from '../../bookings/visits/services/booking-visits.service.js';
import { InventoryFacade } from '../../inventory/inventory.facade.js';
import { LocationService } from '../../location/services/location.service.js';
import { LineDiscountChoice } from '../../pricing/engine/interfaces/line-discount-choice.interface.js';
import { ProductLinePrice } from '../../pricing/interfaces/product-line-price.interface.js';
import { OrderPricingRequestDto } from '../dto/order-pricing-request.dto.js';
import { OrderPricingContext } from '../enums/order-pricing-context.enum.js';
import { OrderPricingPreview } from '../interfaces/order-pricing-preview.interface.js';
import { OrderWithItems } from '../interfaces/order-with-items.interface.js';
import { ProductPricingLineView } from '../interfaces/product-pricing-line-view.interface.js';
import {
  ProductPricingScope,
  ProductPricingVisit,
} from '../interfaces/product-pricing-scope.interface.js';
import { VisitProductsPricing } from '../interfaces/visit-products-pricing.interface.js';
import { OrderProductItemDto } from '../dto/order-product-item.dto.js';
import { PurchaseCostAccess } from '../interfaces/purchase-cost-access.interface.js';
import {
  confirmedProductListTotal,
  productPriceData,
  requestedChoice,
  storedChoice,
} from '../rules/order-product-price.rules.js';
import { OrderDraftService } from './order-draft.service.js';
import { OrderPersistenceService } from './order-persistence.service.js';
import { OrderProductPricingService } from './order-product-pricing.service.js';

/** Who previews: draft resolution needs an actor, the preview writes nothing. */
const PREVIEW_ACTOR = { name: 'Preview', role: AuditActorRole.SYSTEM };

/**
 * POST orders/pricing (docs/pricing-stage7-api.md): the server prices the lines of the sale
 * form, of a draft and of the "add products" dialog of a booking. Nothing is written; prices
 * come through the cache.
 */
@Injectable()
export class OrderPricingPreviewService {
  constructor(
    private readonly db: DatabaseService,
    private readonly locations: LocationService,
    private readonly persistence: OrderPersistenceService,
    private readonly drafts: OrderDraftService,
    private readonly productPricing: OrderProductPricingService,
    private readonly visits: BookingVisitsService,
    private readonly inventory: InventoryFacade,
  ) {}

  async preview(
    locationId: string,
    dto: OrderPricingRequestDto,
    canOverridePrice: boolean,
    access: PurchaseCostAccess,
  ): Promise<OrderPricingPreview> {
    this.drafts.validateItems(dto.items);
    const location = await this.locations.findById(locationId);
    const order = await this.findOrder(locationId, dto);
    const bookingId = order?.bookingId ?? dto.bookingId ?? null;
    if (bookingId && dto.promoCode !== undefined)
      throw new AppException(
        ErrorCode.ORDER_PROMO_CODE_VIA_BOOKING,
        HttpStatus.CONFLICT,
      );
    const existing = order
      ? {
          ...order,
          items: order.items.filter(
            (item) =>
              item.type === OrderItemType.PRODUCT &&
              item.status === OrderItemStatus.DRAFT,
          ),
        }
      : undefined;
    const resolved = await this.drafts.resolveProductItems(
      locationId,
      dto.items,
      PREVIEW_ACTOR,
      existing,
      undefined,
      canOverridePrice,
    );
    const storedByProduct = new Map(
      existing?.items.map((item) => [item.catalogItemId, item]) ?? [],
    );
    const lines = dto.items.map((item, index) => {
      const data = resolved[index];
      const stored = storedByProduct.get(item.productId);
      const choice: LineDiscountChoice | null =
        item.promotion !== undefined
          ? requestedChoice(item.promotion)
          : stored
            ? storedChoice(stored)
            : null;
      return {
        orderItemId: stored?.id ?? null,
        productLocationId: data.productLocationId as string,
        productId: item.productId,
        title: data.title,
        sku: (data.sku as string | null) ?? null,
        unit: data.unit as ProductUnit,
        quantity: new Prisma.Decimal(item.quantity),
        customUnitPrice:
          data.customUnitPrice == null
            ? null
            : new Prisma.Decimal(data.customUnitPrice as Prisma.Decimal),
        sellerStaffId: (data.sellerStaffId as string | null) ?? null,
        choice,
      };
    });
    const scope = await this.scope(location, order, bookingId, dto);
    const quote = await this.productPricing.quote(
      scope,
      lines,
      ReadConsistency.CACHED,
    );
    const views = await this.lineViews(
      locationId,
      lines.map((line, index) => ({ ...line, price: quote.lines[index] })),
      access,
    );
    return {
      currency: location.currency,
      context: scope.visit
        ? OrderPricingContext.BOOKING
        : OrderPricingContext.SALE,
      lines: views,
      listTotalAmount: quote.listTotal,
      subtotalAmount: quote.lines.reduce(
        (sum, line) => sum.plus(line.lineSubtotal),
        MoneyUtils.decimal(0),
      ),
      discountTotal: quote.discountTotal,
      totalAmount: quote.total,
      promoCode: quote.promoCode,
    };
  }

  /**
   * New product lines of a visit (booking window, booking creation) priced in the context of
   * the booking: its start, channel, client and promo code; the confirmed products of its
   * order (`visit.bookingId`) count in the visit total. Custom prices and picks are checked
   * by the caller. Nothing is written.
   */
  async priceVisitProducts(
    locationId: string,
    brand: { brandId: string; timezone: string },
    visit: ProductPricingVisit,
    items: OrderProductItemDto[],
    consistency: ReadConsistency,
    access: PurchaseCostAccess,
  ): Promise<VisitProductsPricing> {
    this.drafts.validateItems(items);
    const resolved = await this.drafts.resolveProductItems(
      locationId,
      items,
      PREVIEW_ACTOR,
      undefined,
      undefined,
      true,
    );
    const order = visit.bookingId
      ? await this.persistence.inTransaction((tx) =>
          this.persistence.findForBookingInTransaction(
            tx,
            locationId,
            visit.bookingId!,
          ),
        )
      : null;
    const lines = items.map((item, index) => {
      const data = resolved[index];
      return {
        orderItemId: null,
        productLocationId: data.productLocationId as string,
        productId: item.productId,
        title: data.title,
        sku: (data.sku as string | null) ?? null,
        unit: data.unit as ProductUnit,
        quantity: new Prisma.Decimal(item.quantity),
        customUnitPrice:
          data.customUnitPrice == null
            ? null
            : new Prisma.Decimal(data.customUnitPrice as Prisma.Decimal),
        sellerStaffId: (data.sellerStaffId as string | null) ?? null,
        choice: requestedChoice(item.promotion),
      };
    });
    const quote = await this.productPricing.quote(
      {
        locationId,
        brandId: brand.brandId,
        timezone: brand.timezone,
        orderId: order?.id ?? null,
        visit,
        sale: null,
        confirmedListTotal: confirmedProductListTotal(order?.items ?? []),
      },
      lines,
      consistency,
    );
    return {
      lines: await this.lineViews(
        locationId,
        lines.map((line, index) => ({ ...line, price: quote.lines[index] })),
        access,
      ),
      quote,
    };
  }

  /**
   * Lines of a preview with the last purchase price (only with Read(INVENTORY)) and the
   * "below cost" mark (always).
   */
  async lineViews(
    locationId: string,
    lines: readonly (Omit<ProductPricingLineView, 'promotion' | 'lastPurchaseUnitCost' | 'belowCost' | 'price'> & {
      price: ProductLinePrice;
      choice: LineDiscountChoice | null;
    })[],
    access: PurchaseCostAccess,
  ): Promise<ProductPricingLineView[]> {
    const costs = await this.inventory.lastPurchaseUnitCosts(
      locationId,
      lines.map((line) => line.productLocationId),
    );
    return lines.map((line) => {
      const cost = costs.get(line.productLocationId) ?? null;
      const kept = productPriceData(line.price, line.choice).fields;
      return {
        orderItemId: line.orderItemId,
        productId: line.productId,
        productLocationId: line.productLocationId,
        title: line.title,
        sku: line.sku,
        unit: line.unit,
        quantity: line.quantity,
        sellerStaffId: line.sellerStaffId,
        price: line.price,
        promotion: kept.discountChoice
          ? {
              mode: kept.discountChoice as LineDiscountChoice['mode'],
              ruleId: kept.discountChoiceRuleId,
            }
          : null,
        lastPurchaseUnitCost: access.canReadPurchaseCost ? cost : null,
        belowCost:
          cost !== null &&
          line.price.lineTotal.lt(MoneyUtils.quantize(cost.mul(line.quantity))),
      };
    });
  }

  /** The order of the request: by orderId, or the visit order of bookingId (may be none). */
  private async findOrder(
    locationId: string,
    dto: OrderPricingRequestDto,
  ): Promise<OrderWithItems | null> {
    if (dto.orderId) {
      const order = await this.persistence.findById(locationId, dto.orderId);
      if (dto.bookingId && order.bookingId !== dto.bookingId)
        throw new AppException(
          ErrorCode.VALIDATION_ERROR,
          HttpStatus.BAD_REQUEST,
          { field: 'bookingId' },
        );
      return order;
    }
    if (!dto.bookingId) return null;
    return this.persistence.inTransaction((tx) =>
      this.persistence.findForBookingInTransaction(
        tx,
        locationId,
        dto.bookingId!,
      ),
    );
  }

  private async scope(
    location: { id: string; brandId: string; timezone: string },
    order: OrderWithItems | null,
    bookingId: string | null,
    dto: OrderPricingRequestDto,
  ): Promise<ProductPricingScope> {
    if (bookingId) {
      const facts = await this.visits.pricingFacts(
        this.db,
        location.id,
        bookingId,
      );
      if (!facts) throw new NotFoundException('Booking not found');
      return {
        locationId: location.id,
        brandId: location.brandId,
        timezone: location.timezone,
        orderId: order?.id ?? null,
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
        confirmedListTotal: confirmedProductListTotal(order?.items ?? []),
      };
    }
    const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : null;
    if (occurredAt && occurredAt.getTime() > Date.now())
      throw new BadRequestException('occurredAt cannot be in the future');
    return {
      locationId: location.id,
      brandId: location.brandId,
      timezone: location.timezone,
      orderId: order?.id ?? null,
      visit: null,
      sale: {
        at: order ? new Date() : (occurredAt ?? new Date()),
        clientId:
          dto.clientId === undefined
            ? (order?.clientId ?? null)
            : dto.clientId,
        promoCode:
          dto.promoCode === undefined
            ? (order?.promoCode ?? null)
            : dto.promoCode,
      },
      confirmedListTotal: confirmedProductListTotal(order?.items ?? []),
    };
  }
}
