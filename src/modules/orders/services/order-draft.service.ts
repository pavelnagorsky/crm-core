import { ForbiddenException, HttpStatus, Injectable } from '@nestjs/common';
import {
  DiscountChoiceMode as PrismaDiscountChoiceMode,
  OrderItemStatus,
  OrderItemType,
  Prisma,
  ProductUnit,
} from '@prisma/client';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { ClientsService } from '../../clients/services/clients.service.js';
import { LocationService } from '../../location/services/location.service.js';
import { ProductsService } from '../../products/services/products.service.js';
import { StaffService } from '../../staff/services/staff.service.js';
import { OrderPricingCalculator } from '../calculators/order-pricing.calculator.js';
import { CreateOrderDto } from '../dto/create-order.dto.js';
import { OrderProductItemDto } from '../dto/order-product-item.dto.js';
import { OrderWithItems } from '../interfaces/order-with-items.interface.js';
import { ResolvedOrderDraft } from '../interfaces/resolved-order-draft.interface.js';
import { LineDiscountChoice } from '../../pricing/engine/interfaces/line-discount-choice.interface.js';
import {
  assertChoiceAccess,
  requestedChoice,
} from '../rules/order-product-price.rules.js';

@Injectable()
export class OrderDraftService {
  constructor(
    private readonly products: ProductsService,
    private readonly staff: StaffService,
    private readonly clients: ClientsService,
    private readonly locations: LocationService,
    private readonly compute: OrderPricingCalculator,
  ) {}

  async resolveDraft(
    locationId: string,
    dto: CreateOrderDto,
    actor: AuditActor,
    existing?: OrderWithItems,
    tx?: Prisma.TransactionClient,
    options: { allowEmptyItems?: boolean } = {},
    canOverridePrice = false,
  ): Promise<ResolvedOrderDraft> {
    const location = await this.locations.findById(locationId);
    const occurredAt = dto.occurredAt
      ? new Date(dto.occurredAt)
      : (existing?.occurredAt ?? new Date());
    if (occurredAt.getTime() > Date.now()) {
      throw new AppException(
        ErrorCode.ORDER_FUTURE_DATE,
        HttpStatus.BAD_REQUEST,
      );
    }
    const productIds = dto.items.map((item) => item.productId);
    if (dto.items.length === 0 && !options.allowEmptyItems) {
      throw new AppException(
        ErrorCode.ORDER_QUANTITY_INVALID,
        HttpStatus.BAD_REQUEST,
      );
    }
    this.assertPositiveQuantities(dto.items);
    this.assertUniqueProducts(productIds);
    const clientId = dto.clientId ?? null;
    const client = clientId
      ? await this.clients.findInBrand(location.brandId, clientId)
      : null;
    const items = await this.resolveProductItems(
      locationId,
      dto.items,
      actor,
      existing,
      tx,
      canOverridePrice,
    );
    return {
      location,
      bookingId: null,
      clientId,
      clientName: client
        ? `${client.firstName} ${client.lastName}`.trim()
        : null,
      clientPhone: client?.phone ?? null,
      occurredAt,
      note: dto.note || null,
      promoCode:
        dto.promoCode === undefined
          ? (existing?.promoCode ?? null)
          : dto.promoCode,
      items,
      totals: this.compute.totals(
        items.map((item) => ({
          listUnitPrice: new Prisma.Decimal(item.listUnitPrice.toString()),
          listLineTotal: new Prisma.Decimal(item.quantity.toString()).mul(
            new Prisma.Decimal(item.listUnitPrice.toString()),
          ),
          customUnitPrice:
            item.customUnitPrice == null
              ? null
              : new Prisma.Decimal(item.customUnitPrice.toString()),
          unitPrice: new Prisma.Decimal(item.unitPrice.toString()),
          lineSubtotal: new Prisma.Decimal(item.lineSubtotal.toString()),
          discountTotal: new Prisma.Decimal(
            item.discountTotal?.toString() ?? '0',
          ),
          lineTotal: new Prisma.Decimal(item.lineTotal.toString()),
        })),
      ),
    };
  }

  async resolveProductItemAdditions(
    locationId: string,
    order: OrderWithItems,
    items: OrderProductItemDto[],
    actor: AuditActor,
    tx: Prisma.TransactionClient,
    canOverridePrice = false,
  ): Promise<{
    created: Prisma.OrderItemUncheckedCreateWithoutOrderInput[];
    updated: {
      id: string;
      before: OrderWithItems['items'][number];
      after: Prisma.OrderItemUncheckedCreateWithoutOrderInput;
    }[];
  }> {
    const productIds = items.map((item) => item.productId);
    this.assertPositiveQuantities(items);
    this.assertUniqueProducts(productIds);

    const draftItems = order.items.filter(
      (item) =>
        item.type === OrderItemType.PRODUCT &&
        item.status === OrderItemStatus.DRAFT &&
        item.catalogItemId,
    );
    const draftByProduct = new Map(
      draftItems.map((item) => [item.catalogItemId!, item]),
    );
    const additions = items.map((item) => {
      const draft = draftByProduct.get(item.productId);
      return {
        draft,
        item: draft ? this.mergeDraftProductItem(draft, item) : item,
      };
    });
    const resolved = await this.resolveProductItems(
      locationId,
      additions.map((addition) => addition.item),
      actor,
      { ...order, items: draftItems },
      tx,
      canOverridePrice,
    );
    return additions.reduce<{
      created: Prisma.OrderItemUncheckedCreateWithoutOrderInput[];
      updated: {
        id: string;
        before: OrderWithItems['items'][number];
        after: Prisma.OrderItemUncheckedCreateWithoutOrderInput;
      }[];
    }>(
      (result, addition, index) => {
        if (addition.draft) {
          result.updated.push({
            id: addition.draft.id,
            before: addition.draft,
            after: resolved[index],
          });
          return result;
        }
        result.created.push(resolved[index]);
        return result;
      },
      { created: [], updated: [] },
    );
  }

  async resolveProductItems(
    locationId: string,
    items: OrderProductItemDto[],
    actor: AuditActor,
    existing?: OrderWithItems,
    tx?: Prisma.TransactionClient,
    canOverridePrice = false,
  ): Promise<Prisma.OrderItemUncheckedCreateWithoutOrderInput[]> {
    this.assertCustomPriceAccess(canOverridePrice, items, existing);
    const productIds = items.map((item) => item.productId);
    const productRows = await this.products.resolveForSale(
      locationId,
      productIds,
      tx,
    );
    if (productRows.length !== productIds.length) {
      throw new AppException(
        ErrorCode.ORDER_PRODUCT_NOT_SELLABLE,
        HttpStatus.BAD_REQUEST,
      );
    }
    const sellerIds = [
      ...new Set(
        items.flatMap((item) =>
          item.sellerStaffId ? [item.sellerStaffId] : [],
        ),
      ),
    ];
    const sellers = await this.staff.resolveForProductSale(
      locationId,
      sellerIds,
      tx,
    );
    if (sellers.length !== sellerIds.length) {
      throw new AppException(
        ErrorCode.ORDER_SELLER_INVALID,
        HttpStatus.BAD_REQUEST,
      );
    }
    const productsById = new Map(
      productRows.map((row) => [row.productId, row]),
    );
    const sellersById = new Map(sellers.map((row) => [row.id, row]));
    const oldCustomByProduct = new Map(
      existing?.items
        .filter((item) => item.type === OrderItemType.PRODUCT)
        .map((item) => [item.catalogItemId, item.customUnitPrice]) ?? [],
    );
    const oldChoiceByProduct = new Map(
      existing?.items
        .filter((item) => item.type === OrderItemType.PRODUCT)
        .map((item) => [item.catalogItemId, item]) ?? [],
    );
    for (const item of items)
      assertChoiceAccess(
        canOverridePrice,
        item.promotion,
        oldChoiceByProduct.get(item.productId) ?? null,
      );
    return items.map((item) => {
      const product = productsById.get(item.productId)!;
      const seller = item.sellerStaffId
        ? sellersById.get(item.sellerStaffId)!
        : null;
      const quantity = new Prisma.Decimal(item.quantity);
      this.assertQuantityMatchesUnit(quantity, product.product.unit);
      const price = this.compute.priceLine(
        quantity,
        product.retailPrice,
        this.customPrice(item, oldCustomByProduct.get(item.productId)),
      );
      return {
        type: OrderItemType.PRODUCT,
        catalogItemId: product.productId,
        categoryId: product.product.categoryId,
        productLocationId: product.id,
        title: product.product.name,
        sku: product.product.sku,
        unit: product.product.unit,
        quantity: item.quantity,
        baseUnitPrice: product.retailPrice,
        listUnitPrice: price.listUnitPrice,
        customUnitPrice: price.customUnitPrice,
        unitPrice: price.unitPrice,
        lineSubtotal: price.lineSubtotal,
        discountTotal: price.discountTotal,
        lineTotal: price.lineTotal,
        sellerStaffId: seller?.id ?? null,
        sellerName: seller?.name ?? null,
        ...this.choiceColumns(item, oldChoiceByProduct.get(item.productId)),
      };
    });
  }

  /**
   * Choices sent in a draft write, by product id, and the index of each product in the
   * request: the draft is priced again with them strictly (OrderProductPricingService).
   */
  requestChoices(items: readonly OrderProductItemDto[]): {
    explicit: Map<string, LineDiscountChoice | null>;
    lineIndexOf: Map<string, number>;
  } {
    const explicit = new Map<string, LineDiscountChoice | null>();
    const lineIndexOf = new Map<string, number>();
    items.forEach((item, index) => {
      lineIndexOf.set(item.productId, index);
      if (item.promotion !== undefined)
        explicit.set(item.productId, requestedChoice(item.promotion));
    });
    return { explicit, lineIndexOf };
  }

  /** The sent choice, or the stored one of the line; AUTO is null. */
  private choiceColumns(
    item: OrderProductItemDto,
    existing:
      | Pick<
          OrderWithItems['items'][number],
          'discountChoice' | 'discountChoiceRuleId'
        >
      | undefined,
  ): {
    discountChoice: PrismaDiscountChoiceMode | null;
    discountChoiceRuleId: string | null;
  } {
    if (item.promotion === undefined)
      return {
        discountChoice: existing?.discountChoice ?? null,
        discountChoiceRuleId: existing?.discountChoiceRuleId ?? null,
      };
    const choice = requestedChoice(item.promotion);
    return {
      discountChoice: choice
        ? (choice.mode as PrismaDiscountChoiceMode)
        : null,
      discountChoiceRuleId: choice?.ruleId ?? null,
    };
  }

  private assertCustomPriceAccess(
    canOverride: boolean,
    items: OrderProductItemDto[],
    existing?: OrderWithItems,
  ): void {
    if (canOverride) return;
    const incomingByProduct = new Map(
      items.map((item) => [item.productId, item]),
    );
    const existingProducts =
      existing?.items.filter((item) => item.type === OrderItemType.PRODUCT) ??
      [];
    for (const old of existingProducts) {
      if (old.customUnitPrice == null) continue;
      const incoming = incomingByProduct.get(old.catalogItemId!);
      if (!incoming) continue;
      if (incoming.customUnitPrice === null) {
        throw new ForbiddenException('Custom price permission required');
      }
      if (
        incoming.customUnitPrice !== undefined &&
        !old.customUnitPrice.equals(incoming.customUnitPrice)
      ) {
        throw new ForbiddenException('Custom price permission required');
      }
    }
    if (
      items.some(
        (item) =>
          item.customUnitPrice != null &&
          !existingProducts.some(
            (old) =>
              old.catalogItemId === item.productId &&
              item.customUnitPrice != null &&
              old.customUnitPrice?.equals(item.customUnitPrice),
          ),
      )
    ) {
      throw new ForbiddenException('Custom price permission required');
    }
  }

  private customPrice(
    item: OrderProductItemDto,
    existing: Prisma.Decimal | null | undefined,
  ): Prisma.Decimal | null {
    if (item.customUnitPrice === undefined) return existing ?? null;
    return item.customUnitPrice == null
      ? null
      : new Prisma.Decimal(item.customUnitPrice);
  }

  /** Quantities above 0, each product once. */
  validateItems(items: OrderProductItemDto[]): void {
    this.assertPositiveQuantities(items);
    this.assertUniqueProducts(items.map((item) => item.productId));
  }

  private assertPositiveQuantities(items: OrderProductItemDto[]): void {
    if (items.some((item) => new Prisma.Decimal(item.quantity).lte(0))) {
      throw new AppException(
        ErrorCode.ORDER_QUANTITY_INVALID,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private assertQuantityMatchesUnit(
    quantity: Prisma.Decimal,
    unit: ProductUnit,
  ): void {
    if (unit !== ProductUnit.PIECE || quantity.isInteger()) return;
    throw new AppException(
      ErrorCode.ORDER_QUANTITY_MUST_BE_WHOLE,
      HttpStatus.BAD_REQUEST,
    );
  }

  private assertUniqueProducts(productIds: string[]): void {
    if (new Set(productIds).size !== productIds.length) {
      throw new AppException(
        ErrorCode.ORDER_DUPLICATE_PRODUCT,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private mergeDraftProductItem(
    existing: OrderWithItems['items'][number],
    incoming: OrderProductItemDto,
  ): OrderProductItemDto {
    const customUnitPrice =
      incoming.customUnitPrice === undefined
        ? (existing.customUnitPrice?.toFixed(2) ?? undefined)
        : incoming.customUnitPrice;
    const sellerStaffId =
      incoming.sellerStaffId === undefined
        ? (existing.sellerStaffId ?? null)
        : incoming.sellerStaffId;
    return {
      ...incoming,
      quantity: existing.quantity
        .plus(new Prisma.Decimal(incoming.quantity))
        .toFixed(3),
      ...(customUnitPrice === undefined ? {} : { customUnitPrice }),
      sellerStaffId,
    };
  }
}
