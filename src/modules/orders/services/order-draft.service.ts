import { ForbiddenException, HttpStatus, Injectable } from '@nestjs/common';
import {
  AuditActorRole,
  OrderItemStatus,
  OrderItemType,
  Prisma,
} from '@prisma/client';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { ClientsService } from '../../clients/clients.service.js';
import { LocationService } from '../../location/location.service.js';
import { ProductsService } from '../../products/products.service.js';
import { StaffService } from '../../staff/staff.service.js';
import { CreateOrderDto } from '../dto/create-order.dto.js';
import { OrderProductItemDto } from '../dto/order-product-item.dto.js';
import { OrderPricingLine } from '../interfaces/order-pricing-line.interface.js';
import { OrderWithItems } from '../interfaces/order-with-items.interface.js';
import { ResolvedOrderDraft } from '../interfaces/resolved-order-draft.interface.js';
import { OrderComputeService } from './order-compute.service.js';

@Injectable()
export class OrderDraftService {
  constructor(
    private readonly products: ProductsService,
    private readonly staff: StaffService,
    private readonly clients: ClientsService,
    private readonly locations: LocationService,
    private readonly compute: OrderComputeService,
  ) {}

  async resolveDraft(
    locationId: string,
    dto: CreateOrderDto,
    actor: AuditActor,
    existing?: OrderWithItems,
    tx?: Prisma.TransactionClient,
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
    if (
      dto.items.length === 0 ||
      dto.items.some((item) => new Prisma.Decimal(item.quantity).lte(0))
    ) {
      throw new AppException(
        ErrorCode.ORDER_QUANTITY_INVALID,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (new Set(productIds).size !== productIds.length) {
      throw new AppException(
        ErrorCode.ORDER_DUPLICATE_PRODUCT,
        HttpStatus.BAD_REQUEST,
      );
    }
    this.assertCustomPriceAccess(actor, dto.items, existing);
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
      note: dto.note?.trim() || null,
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

  async priceProductItems(
    locationId: string,
    items: OrderProductItemDto[],
  ): Promise<OrderPricingLine[]> {
    if (items.length === 0) return [];
    const productIds = items.map((item) => item.productId);
    if (items.some((item) => new Prisma.Decimal(item.quantity).lte(0))) {
      throw new AppException(
        ErrorCode.ORDER_QUANTITY_INVALID,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (new Set(productIds).size !== productIds.length) {
      throw new AppException(
        ErrorCode.ORDER_DUPLICATE_PRODUCT,
        HttpStatus.BAD_REQUEST,
      );
    }
    const productRows = await this.products.resolveForSale(
      locationId,
      productIds,
    );
    if (productRows.length !== productIds.length) {
      throw new AppException(
        ErrorCode.ORDER_PRODUCT_NOT_SELLABLE,
        HttpStatus.BAD_REQUEST,
      );
    }
    const productsById = new Map(
      productRows.map((row) => [row.productId, row]),
    );
    return items.map((item) => {
      const product = productsById.get(item.productId)!;
      const quantity = new Prisma.Decimal(item.quantity);
      const price = this.compute.priceLine(
        quantity,
        product.retailPrice,
        item.customUnitPrice == null
          ? null
          : new Prisma.Decimal(item.customUnitPrice),
      );
      return {
        type: OrderItemType.PRODUCT,
        catalogItemId: product.productId,
        title: product.product.name,
        sku: product.product.sku,
        unit: product.product.unit,
        quantity,
        ...price,
      };
    });
  }

  assertProductItemsCanBeAdded(
    order: OrderWithItems,
    items: OrderProductItemDto[],
  ): void {
    const productIds = items.map((item) => item.productId);
    if (new Set(productIds).size !== productIds.length) {
      throw new AppException(
        ErrorCode.ORDER_DUPLICATE_PRODUCT,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (
      order.items.some(
        (item) =>
          item.type === OrderItemType.PRODUCT &&
          item.status !== OrderItemStatus.REVERSED &&
          item.catalogItemId &&
          productIds.includes(item.catalogItemId),
      )
    ) {
      throw new AppException(
        ErrorCode.ORDER_DUPLICATE_PRODUCT,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async resolveProductItems(
    locationId: string,
    items: OrderProductItemDto[],
    actor: AuditActor,
    existing?: OrderWithItems,
    tx?: Prisma.TransactionClient,
  ): Promise<Prisma.OrderItemUncheckedCreateWithoutOrderInput[]> {
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
    return items.map((item) => {
      const product = productsById.get(item.productId)!;
      const seller = item.sellerStaffId
        ? sellersById.get(item.sellerStaffId)!
        : null;
      const price = this.compute.priceLine(
        new Prisma.Decimal(item.quantity),
        product.retailPrice,
        this.customPrice(actor, item, oldCustomByProduct.get(item.productId)),
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
        listUnitPrice: price.listUnitPrice,
        customUnitPrice: price.customUnitPrice,
        unitPrice: price.unitPrice,
        lineSubtotal: price.lineSubtotal,
        discountTotal: price.discountTotal,
        lineTotal: price.lineTotal,
        sellerStaffId: seller?.id ?? null,
        sellerName: seller?.name ?? null,
      };
    });
  }

  canSetCustomPrice(actor: AuditActor): boolean {
    return (
      actor.role === AuditActorRole.OWNER ||
      actor.role === AuditActorRole.SUPPORT
    );
  }

  private assertCustomPriceAccess(
    actor: AuditActor,
    items: OrderProductItemDto[],
    existing?: OrderWithItems,
  ): void {
    if (this.canSetCustomPrice(actor)) return;
    const incomingByProduct = new Map(
      items.map((item) => [item.productId, item]),
    );
    const existingProducts =
      existing?.items.filter((item) => item.type === OrderItemType.PRODUCT) ??
      [];
    for (const old of existingProducts) {
      if (old.customUnitPrice == null) continue;
      const incoming = incomingByProduct.get(old.catalogItemId!);
      if (!incoming || incoming.customUnitPrice === null) {
        throw new ForbiddenException('Only an owner can clear a custom price');
      }
      if (
        incoming.customUnitPrice !== undefined &&
        !old.customUnitPrice.equals(incoming.customUnitPrice)
      ) {
        throw new ForbiddenException('Only an owner can change a custom price');
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
      throw new ForbiddenException('Only an owner can set a custom price');
    }
  }

  private customPrice(
    actor: AuditActor,
    item: OrderProductItemDto,
    existing: Prisma.Decimal | null | undefined,
  ): Prisma.Decimal | null {
    if (!this.canSetCustomPrice(actor) && existing != null) return existing;
    return item.customUnitPrice == null
      ? null
      : new Prisma.Decimal(item.customUnitPrice);
  }
}
