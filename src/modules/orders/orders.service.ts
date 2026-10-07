import {
  ForbiddenException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AuditActorRole,
  OrderItemType,
  OrderStatus,
  Prisma,
} from '@prisma/client';
import { DatabaseService } from '../../database/database.service.js';
import { stableOrderBy } from '../../shared/database/stable-order-by.js';
import { OrderDirection } from '../../shared/enums/order-direction.enum.js';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { PaginatedResult } from '../../shared/interfaces/paginated-result.interface.js';
import { ErrorCode } from '../../shared/validation/error-codes.enum.js';
import { AUDIT_EVENT } from '../audit/audit.constants.js';
import { AuditActionType } from '../audit/enums/audit-action-type.enum.js';
import { AuditEntity } from '../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../audit/enums/audit-event.enum.js';
import { AuditActor } from '../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../audit/interfaces/audit-log-event.interface.js';
import { BookingsService } from '../bookings/bookings.service.js';
import { ClientsService } from '../clients/clients.service.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { InventorySaleLine } from '../inventory/interfaces/inventory-sale-line.interface.js';
import { LocationService } from '../location/location.service.js';
import { StaffEarningsService } from '../payroll/earnings/staff-earnings.service.js';
import { ProductOrderCommissionLine } from '../payroll/earnings/interfaces/product-order-commission-line.interface.js';
import { ProductsService } from '../products/products.service.js';
import { StaffService } from '../staff/staff.service.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { OrderProductItemDto } from './dto/order-product-item.dto.js';
import { OrderSearchRequestDto } from './dto/order-search-request.dto.js';
import { UpdateOrderDto } from './dto/update-order.dto.js';
import { OrderSearchOrderBy } from './enums/order-search-order-by.enum.js';
import { OrderTargetStatus } from './enums/order-target-status.enum.js';
import { OrderTransition } from './interfaces/order-transition.interface.js';
import { OrderWithItems } from './interfaces/order-with-items.interface.js';
import { ResolvedOrderDraft } from './interfaces/resolved-order-draft.interface.js';
import { OrderComputeService } from './order-compute.service.js';

const orderInclude = {
  items: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.OrderInclude;

@Injectable()
export class OrdersService {
  constructor(
    private readonly db: DatabaseService,
    private readonly products: ProductsService,
    private readonly inventory: InventoryService,
    private readonly staff: StaffService,
    private readonly earnings: StaffEarningsService,
    private readonly bookings: BookingsService,
    private readonly clients: ClientsService,
    private readonly locations: LocationService,
    private readonly compute: OrderComputeService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(
    locationId: string,
    dto: CreateOrderDto,
    actor: AuditActor,
  ): Promise<OrderWithItems> {
    const draft = await this.resolveDraft(locationId, dto, actor);
    const order = await this.db.order.create({
      data: {
        locationId,
        bookingId: draft.bookingId,
        clientId: draft.clientId,
        clientName: draft.clientName,
        clientPhone: draft.clientPhone,
        currency: draft.location.currency,
        occurredAt: draft.occurredAt,
        note: draft.note,
        createdById: actor.id ?? null,
        createdByName: actor.name,
        ...draft.totals,
        items: { create: draft.items },
      },
      include: orderInclude,
    });
    this.emit(
      draft.location.brandId,
      locationId,
      order.id,
      AuditEvent.ORDER_CREATED,
      AuditActionType.CREATE,
      actor,
      { totalAmount: order.totalAmount.toFixed(2), currency: order.currency },
    );
    return order;
  }

  async update(
    locationId: string,
    orderId: string,
    dto: UpdateOrderDto,
    actor: AuditActor,
  ): Promise<OrderWithItems> {
    const result = await this.inTransaction(async (tx) => {
      await this.lockOrder(tx, orderId);
      const locked = await this.findInTransaction(tx, locationId, orderId);
      this.assertOpen(locked.status);
      const draft = await this.resolveDraft(locationId, dto, actor, locked, tx);
      await tx.orderItem.deleteMany({ where: { orderId } });
      const order = await tx.order.update({
        where: { id: orderId },
        data: {
          bookingId: draft.bookingId,
          clientId: draft.clientId,
          clientName: draft.clientName,
          clientPhone: draft.clientPhone,
          occurredAt: draft.occurredAt,
          note: draft.note,
          ...draft.totals,
          items: { create: draft.items },
        },
        include: orderInclude,
      });
      return { order, draft };
    });
    this.emit(
      result.draft.location.brandId,
      locationId,
      result.order.id,
      AuditEvent.ORDER_UPDATED,
      AuditActionType.MODIFY,
      actor,
      {
        totalAmount: result.order.totalAmount.toFixed(2),
        currency: result.order.currency,
      },
    );
    return result.order;
  }

  async findById(locationId: string, orderId: string): Promise<OrderWithItems> {
    const order = await this.db.order.findFirst({
      where: { id: orderId, locationId },
      include: orderInclude,
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async search(
    locationId: string,
    dto: OrderSearchRequestDto,
  ): Promise<PaginatedResult<OrderWithItems>> {
    const where: Prisma.OrderWhereInput = {
      locationId,
      status: dto.status,
      clientId: dto.clientId,
      bookingId: dto.bookingId,
      occurredAt:
        dto.from || dto.to
          ? {
              gte: dto.from ? new Date(dto.from) : undefined,
              lte: dto.to ? new Date(dto.to) : undefined,
            }
          : undefined,
    };
    const search = dto.search?.trim();
    if (search) {
      where.OR = [
        { clientName: { contains: search, mode: 'insensitive' } },
        { clientPhone: { contains: search } },
        {
          items: { some: { title: { contains: search, mode: 'insensitive' } } },
        },
        { items: { some: { sku: { contains: search, mode: 'insensitive' } } } },
      ];
    }
    const direction = dto.orderDirection ?? OrderDirection.DESC;
    const args: Prisma.OrderFindManyArgs = {
      where,
      include: orderInclude,
      orderBy: stableOrderBy(
        { [dto.orderBy ?? OrderSearchOrderBy.OCCURRED_AT]: direction },
        direction,
      ),
    };
    if (!dto.isExport) {
      args.skip = (dto.page - 1) * dto.pageSize;
      args.take = dto.pageSize;
    }
    const [items, totalItems] = await this.db.$transaction([
      this.db.order.findMany(args),
      this.db.order.count({ where }),
    ]);
    return { items: items as OrderWithItems[], totalItems };
  }

  async changeStatus(
    locationId: string,
    orderId: string,
    status: OrderTargetStatus,
    reason: string | undefined,
    actor: AuditActor,
  ): Promise<OrderWithItems> {
    if (status === OrderTargetStatus.VOIDED && !this.canSetCustomPrice(actor)) {
      throw new ForbiddenException('Only an owner can void a posted order');
    }
    const location = await this.locations.findById(locationId);
    const transition =
      status === OrderTargetStatus.POSTED
        ? await this.post(locationId, orderId)
        : await this.void(locationId, orderId, reason, actor);
    if (transition.changed) {
      this.emit(
        location.brandId,
        locationId,
        orderId,
        status === OrderTargetStatus.POSTED
          ? AuditEvent.ORDER_POSTED
          : AuditEvent.ORDER_VOIDED,
        AuditActionType.ACTION,
        actor,
        {
          totalAmount: transition.order.totalAmount.toFixed(2),
          currency: transition.order.currency,
          reason: transition.order.voidReason,
        },
      );
    }
    return transition.order;
  }

  async delete(
    locationId: string,
    orderId: string,
    actor: AuditActor,
  ): Promise<void> {
    const location = await this.locations.findById(locationId);
    const deleted = await this.inTransaction(async (tx) => {
      await this.lockOrder(tx, orderId);
      const order = await this.findInTransaction(tx, locationId, orderId);
      this.assertOpen(order.status);
      await tx.order.delete({ where: { id: orderId } });
      return order;
    });
    this.emit(
      location.brandId,
      locationId,
      orderId,
      AuditEvent.ORDER_DELETED,
      AuditActionType.DELETE,
      actor,
      {
        totalAmount: deleted.totalAmount.toFixed(2),
        currency: deleted.currency,
      },
    );
  }

  private async post(
    locationId: string,
    orderId: string,
  ): Promise<OrderTransition> {
    return this.inTransaction(async (tx) => {
      await this.lockOrder(tx, orderId);
      const order = await this.findInTransaction(tx, locationId, orderId);
      if (order.status === OrderStatus.POSTED) {
        return { order, changed: false };
      }
      this.assertOpen(order.status);
      const productIds = order.items.map((item) => item.catalogItemId!);
      const products = await this.products.resolveForSale(
        locationId,
        productIds,
        tx,
      );
      if (products.length !== productIds.length) {
        throw new AppException(
          ErrorCode.ORDER_PRODUCT_NOT_SELLABLE,
          HttpStatus.CONFLICT,
        );
      }
      const sellers = await this.staff.resolveForProductSale(
        locationId,
        order.items.flatMap((item) =>
          item.sellerStaffId ? [item.sellerStaffId] : [],
        ),
        tx,
      );
      const sellerIds = new Set(sellers.map((seller) => seller.id));
      if (
        order.items.some(
          (item) => item.sellerStaffId && !sellerIds.has(item.sellerStaffId),
        )
      ) {
        throw new AppException(
          ErrorCode.ORDER_SELLER_INVALID,
          HttpStatus.CONFLICT,
        );
      }
      const byProduct = new Map(products.map((row) => [row.productId, row]));
      const saleLines: InventorySaleLine[] = order.items.map((item) => {
        const product = byProduct.get(item.catalogItemId!)!;
        return {
          orderItemId: item.id,
          productLocationId: product.id,
          productId: product.productId,
          productName: item.title,
          productSku: item.sku,
          productUnit: product.product.unit,
          quantity: item.quantity.toString(),
          trackInventory: product.trackInventory,
        };
      });
      const costs = await this.inventory.postSale(
        locationId,
        orderId,
        order.occurredAt,
        saleLines,
        tx,
      );
      for (const cost of costs) {
        await tx.orderItem.update({
          where: { id: cost.orderItemId },
          data: {
            unitCostSnapshot: cost.unitCost,
            lineCostSnapshot: cost.lineCost,
          },
        });
      }
      const commissionLines: ProductOrderCommissionLine[] = order.items.flatMap(
        (item) =>
          item.sellerStaffId
            ? [
                {
                  orderItemId: item.id,
                  staffId: item.sellerStaffId,
                  amount: item.lineTotal,
                  description: item.title,
                },
              ]
            : [],
      );
      await this.earnings.recordForProductOrder(
        locationId,
        orderId,
        order.occurredAt,
        order.currency,
        commissionLines,
        tx,
      );
      const posted = await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.POSTED, postedAt: new Date() },
        include: orderInclude,
      });
      return { order: posted, changed: true };
    });
  }

  private async void(
    locationId: string,
    orderId: string,
    rawReason: string | undefined,
    actor: AuditActor,
  ): Promise<OrderTransition> {
    const reason = rawReason?.trim();
    if (!reason) {
      throw new AppException(
        ErrorCode.ORDER_VOID_REASON_REQUIRED,
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.inTransaction(async (tx) => {
      await this.lockOrder(tx, orderId);
      const order = await this.findInTransaction(tx, locationId, orderId);
      if (order.status === OrderStatus.VOIDED) {
        return { order, changed: false };
      }
      if (order.status !== OrderStatus.POSTED) {
        throw new AppException(
          ErrorCode.ORDER_STATUS_INVALID,
          HttpStatus.CONFLICT,
        );
      }
      await this.earnings.reverseForProductOrder(
        locationId,
        orderId,
        reason,
        actor,
        tx,
      );
      await this.inventory.reverseSale(locationId, orderId, new Date(), tx);
      const voided = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.VOIDED,
          voidedAt: new Date(),
          voidReason: reason,
        },
        include: orderInclude,
      });
      return { order: voided, changed: true };
    });
  }

  private async resolveDraft(
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
        dto.items.flatMap((item) =>
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
    const booking = dto.bookingId
      ? await this.bookings.findByIdInLocation(locationId, dto.bookingId)
      : null;
    const clientId = dto.clientId ?? booking?.clientId ?? null;
    if (booking && dto.clientId && dto.clientId !== booking.clientId) {
      throw new AppException(
        ErrorCode.ORDER_CLIENT_BOOKING_MISMATCH,
        HttpStatus.BAD_REQUEST,
      );
    }
    const client = clientId
      ? await this.clients.findInBrand(location.brandId, clientId)
      : null;
    const productsById = new Map(
      productRows.map((row) => [row.productId, row]),
    );
    const sellersById = new Map(sellers.map((row) => [row.id, row]));
    const oldCustomByProduct = new Map(
      existing?.items.map((item) => [
        item.catalogItemId,
        item.customUnitPrice,
      ]) ?? [],
    );
    const linePrices = dto.items.map((item) => {
      const product = productsById.get(item.productId)!;
      const custom = this.customPrice(
        actor,
        item,
        oldCustomByProduct.get(item.productId),
      );
      return this.compute.priceLine(
        new Prisma.Decimal(item.quantity),
        product.retailPrice,
        custom,
      );
    });
    const items: Prisma.OrderItemCreateWithoutOrderInput[] = dto.items.map(
      (item, index) => {
        const product = productsById.get(item.productId)!;
        const seller = item.sellerStaffId
          ? sellersById.get(item.sellerStaffId)!
          : null;
        const price = linePrices[index];
        return {
          type: OrderItemType.PRODUCT,
          catalogItemId: product.productId,
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
      },
    );
    return {
      location,
      bookingId: booking?.id ?? null,
      clientId,
      clientName: client
        ? `${client.firstName} ${client.lastName}`.trim()
        : null,
      clientPhone: client?.phone ?? null,
      occurredAt,
      note: dto.note?.trim() || null,
      items,
      totals: this.compute.totals(linePrices),
    };
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
    for (const old of existing?.items ?? []) {
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
          !existing?.items.some(
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

  private canSetCustomPrice(actor: AuditActor): boolean {
    return (
      actor.role === AuditActorRole.OWNER ||
      actor.role === AuditActorRole.SUPPORT
    );
  }

  private assertOpen(status: OrderStatus): void {
    if (status !== OrderStatus.OPEN) {
      throw new AppException(ErrorCode.ORDER_NOT_OPEN, HttpStatus.CONFLICT);
    }
  }

  private inTransaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.db.$transaction(operation, {
      maxWait: 5_000,
      timeout: 30_000,
    });
  }

  private lockOrder(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<unknown> {
    return tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE
    `);
  }

  private async findInTransaction(
    tx: Prisma.TransactionClient,
    locationId: string,
    orderId: string,
  ): Promise<OrderWithItems> {
    const order = await tx.order.findFirst({
      where: { id: orderId, locationId },
      include: orderInclude,
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  private emit(
    brandId: string,
    locationId: string,
    entityId: string,
    eventType: AuditEvent,
    actionType: AuditActionType,
    actor: AuditActor,
    payload: Record<string, unknown>,
  ): void {
    this.eventEmitter.emit(AUDIT_EVENT, {
      brandId,
      locationId,
      entityType: AuditEntity.ORDER,
      entityId,
      eventType,
      actionType,
      occurredAt: new Date(),
      actor,
      payload,
    } satisfies AuditLogEvent);
  }
}
