import {
  BadRequestException,
  ForbiddenException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  AuditActorRole,
  OrderItemStatus,
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
import { AUDIT_EVENT } from '../audit/constants/audit.constants.js';
import { AuditActionType } from '../audit/enums/audit-action-type.enum.js';
import { AuditEntity } from '../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../audit/enums/audit-event.enum.js';
import { AuditActor } from '../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../audit/interfaces/audit-log-event.interface.js';
import { BookingWithItems } from '../bookings/interfaces/booking-with-items.interface.js';
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
import { OrderComputeService } from './services/order-compute.service.js';

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
    if (dto.confirmImmediately) {
      return this.createAndConfirmProductSale(locationId, dto, actor);
    }
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

  private async createAndConfirmProductSale(
    locationId: string,
    dto: CreateOrderDto,
    actor: AuditActor,
  ): Promise<OrderWithItems> {
    const idempotencyKey = dto.idempotencyKey?.trim();
    if (!idempotencyKey) {
      throw new BadRequestException(
        'idempotencyKey is required for confirmed product sales',
      );
    }
    const result = await this.inTransaction(async (tx) => {
      const existing = await tx.order.findFirst({
        where: { locationId, idempotencyKey },
        include: orderInclude,
      });
      if (existing) return { order: existing, draft: null, created: false };
      const draft = await this.resolveDraft(
        locationId,
        dto,
        actor,
        undefined,
        tx,
      );
      const order = await tx.order.upsert({
        where: {
          locationId_idempotencyKey: {
            locationId,
            idempotencyKey,
          },
        },
        update: {},
        create: {
          locationId,
          bookingId: null,
          clientId: draft.clientId,
          clientName: draft.clientName,
          clientPhone: draft.clientPhone,
          currency: draft.location.currency,
          occurredAt: draft.occurredAt,
          note: draft.note,
          idempotencyKey,
          createdById: actor.id ?? null,
          createdByName: actor.name,
          ...draft.totals,
          items: { create: draft.items },
        },
        include: orderInclude,
      });
      const created = order.items.some(
        (item) => item.status === OrderItemStatus.DRAFT,
      );
      const transition = await this.confirmProductItemsInTransaction(
        locationId,
        order.id,
        order.items.map((item) => item.id),
        tx,
        order.occurredAt,
      );
      return { order: transition.order, draft, created };
    });
    if (result.created && result.draft) {
      this.emit(
        result.draft.location.brandId,
        locationId,
        result.order.id,
        AuditEvent.ORDER_CREATED,
        AuditActionType.CREATE,
        actor,
        {
          totalAmount: result.order.totalAmount.toFixed(2),
          currency: result.order.currency,
        },
      );
    }
    return result.order;
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
      this.assertActive(locked.status);
      this.assertDraftItems(locked);
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

  async syncCompletedBooking(
    booking: BookingWithItems,
    actor: AuditActor,
    tx: Prisma.TransactionClient,
  ): Promise<OrderWithItems> {
    const location = await this.locations.findById(booking.locationId);
    await tx.order.upsert({
      where: { bookingId: booking.id },
      update: {
        clientId: booking.clientId,
        clientName: this.clientName(
          booking.clientFirstName,
          booking.clientLastName,
        ),
        clientPhone: booking.clientPhone,
        occurredAt: booking.endAt,
      },
      create: {
        locationId: booking.locationId,
        bookingId: booking.id,
        clientId: booking.clientId,
        clientName: this.clientName(
          booking.clientFirstName,
          booking.clientLastName,
        ),
        clientPhone: booking.clientPhone,
        currency: location.currency,
        occurredAt: booking.endAt,
        createdById: actor.id ?? null,
        createdByName: actor.name,
      },
    });

    const order = await this.findByBookingInTransaction(
      tx,
      booking.locationId,
      booking.id,
    );
    const confirmedByBookingItem = new Map<string, OrderWithItems['items']>();
    for (const item of order.items) {
      if (
        item.type !== OrderItemType.SERVICE ||
        item.status !== OrderItemStatus.CONFIRMED ||
        !item.bookingItemId
      ) {
        continue;
      }
      confirmedByBookingItem.set(item.bookingItemId, [
        ...(confirmedByBookingItem.get(item.bookingItemId) ?? []),
        item,
      ]);
    }

    for (const item of booking.items) {
      const confirmedAt = new Date();
      const data = this.completedBookingServiceItemData(item, confirmedAt);
      const existing = confirmedByBookingItem.get(item.id) ?? [];
      const current = existing.find((row) =>
        this.matchesCompletedBookingServiceItem(row, data),
      );
      const stale = current
        ? existing.filter((row) => row.id !== current.id)
        : existing;

      if (stale.length > 0) {
        await tx.orderItem.updateMany({
          where: { id: { in: stale.map((row) => row.id) } },
          data: { status: OrderItemStatus.REVERSED },
        });
      }
      if (!current) {
        await tx.orderItem.create({
          data: {
            ...data,
            orderId: order.id,
          },
        });
      }
    }

    return this.refreshTotals(tx, booking.locationId, order.id);
  }

  private completedBookingServiceItemData(
    item: BookingWithItems['items'][number],
    confirmedAt: Date,
  ): Prisma.OrderItemUncheckedCreateWithoutOrderInput {
    const price = this.compute.priceLine(
      new Prisma.Decimal(1),
      item.chargedPrice,
      item.customPrice,
    );
    return {
      type: OrderItemType.SERVICE,
      bookingItemId: item.id,
      status: OrderItemStatus.CONFIRMED,
      catalogItemId: item.serviceId,
      title: item.serviceTitle,
      quantity: new Prisma.Decimal(1),
      listUnitPrice: price.listUnitPrice,
      customUnitPrice: price.customUnitPrice,
      unitPrice: price.unitPrice,
      lineSubtotal: price.lineSubtotal,
      discountTotal: price.discountTotal,
      lineTotal: price.lineTotal,
      sellerStaffId: item.staffId,
      sellerName: item.staffName,
      confirmedAt,
      occurredAt: item.endAt,
    };
  }

  private matchesCompletedBookingServiceItem(
    existing: OrderWithItems['items'][number],
    expected: Prisma.OrderItemUncheckedCreateWithoutOrderInput,
  ): boolean {
    return (
      existing.bookingItemId === expected.bookingItemId &&
      existing.catalogItemId === expected.catalogItemId &&
      existing.title === expected.title &&
      this.decimalEquals(existing.quantity, expected.quantity) &&
      this.decimalEquals(existing.listUnitPrice, expected.listUnitPrice) &&
      this.decimalEqualsNullable(
        existing.customUnitPrice,
        expected.customUnitPrice,
      ) &&
      this.decimalEquals(existing.unitPrice, expected.unitPrice) &&
      this.decimalEquals(existing.lineSubtotal, expected.lineSubtotal) &&
      this.decimalEquals(existing.discountTotal, expected.discountTotal) &&
      this.decimalEquals(existing.lineTotal, expected.lineTotal) &&
      existing.sellerStaffId === expected.sellerStaffId &&
      existing.sellerName === expected.sellerName &&
      this.dateEquals(existing.occurredAt, expected.occurredAt)
    );
  }

  private decimalEquals(left: Prisma.Decimal, right: unknown): boolean {
    return right !== undefined && left.equals(String(right));
  }

  private decimalEqualsNullable(
    left: Prisma.Decimal | null,
    right: unknown,
  ): boolean {
    if (left === null || right == null) return left === null && right == null;
    return left.equals(String(right));
  }

  private dateEquals(
    left: Date | null,
    right: Date | string | null | undefined,
  ): boolean {
    if (left === null || right == null) return left === null && right == null;
    return left.getTime() === new Date(right).getTime();
  }

  async reverseCompletedBookingServices(
    booking: BookingWithItems,
    tx: Prisma.TransactionClient,
  ): Promise<OrderWithItems | null> {
    const order = await tx.order.findUnique({
      where: { bookingId: booking.id },
      include: orderInclude,
    });
    if (!order || order.locationId !== booking.locationId) return null;
    await tx.orderItem.updateMany({
      where: {
        orderId: order.id,
        type: OrderItemType.SERVICE,
        status: OrderItemStatus.CONFIRMED,
      },
      data: { status: OrderItemStatus.REVERSED },
    });
    return this.refreshTotals(tx, booking.locationId, order.id);
  }

  async addDraftProductToBookingOrder(
    booking: BookingWithItems,
    dto: OrderProductItemDto,
    actor: AuditActor,
    tx: Prisma.TransactionClient,
  ): Promise<OrderWithItems> {
    const order = await this.ensureBookingOrder(booking, actor, tx);
    this.assertActive(order.status);
    if (
      order.items.some(
        (item) =>
          item.type === OrderItemType.PRODUCT &&
          item.status !== OrderItemStatus.REVERSED &&
          item.catalogItemId === dto.productId,
      )
    ) {
      throw new AppException(
        ErrorCode.ORDER_DUPLICATE_PRODUCT,
        HttpStatus.BAD_REQUEST,
      );
    }
    const [item] = await this.resolveProductItems(
      booking.locationId,
      [dto],
      actor,
      order,
      tx,
    );
    await tx.orderItem.create({
      data: {
        orderId: order.id,
        ...item,
      },
    });
    return this.refreshTotals(tx, booking.locationId, order.id);
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
    _status: OrderTargetStatus,
    reason: string | undefined,
    actor: AuditActor,
  ): Promise<OrderWithItems> {
    if (!this.canSetCustomPrice(actor)) {
      throw new ForbiddenException('Only an owner can void an order');
    }
    const location = await this.locations.findById(locationId);
    const transition = await this.void(locationId, orderId, reason, actor);
    if (transition.changed) {
      this.emit(
        location.brandId,
        locationId,
        orderId,
        AuditEvent.ORDER_VOIDED,
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

  async confirmItem(
    locationId: string,
    orderId: string,
    orderItemId: string,
    actor: AuditActor,
  ): Promise<OrderWithItems> {
    const location = await this.locations.findById(locationId);
    const transition = await this.confirmProductItem(
      locationId,
      orderId,
      orderItemId,
    );
    if (transition.changed) {
      this.emit(
        location.brandId,
        locationId,
        orderId,
        AuditEvent.ORDER_ITEM_CONFIRMED,
        AuditActionType.ACTION,
        actor,
        {
          orderItemId,
          totalAmount: transition.order.totalAmount.toFixed(2),
          currency: transition.order.currency,
        },
      );
    }
    return transition.order;
  }

  async reverseItem(
    locationId: string,
    orderId: string,
    orderItemId: string,
    rawReason: string,
    actor: AuditActor,
  ): Promise<OrderWithItems> {
    const reason = rawReason.trim();
    if (!reason) {
      throw new AppException(
        ErrorCode.ORDER_VOID_REASON_REQUIRED,
        HttpStatus.BAD_REQUEST,
      );
    }
    const location = await this.locations.findById(locationId);
    const transition = await this.reverseProductItem(
      locationId,
      orderId,
      orderItemId,
      reason,
      actor,
    );
    if (transition.changed) {
      this.emit(
        location.brandId,
        locationId,
        orderId,
        AuditEvent.ORDER_ITEM_REVERSED,
        AuditActionType.ACTION,
        actor,
        {
          orderItemId,
          reason,
          totalAmount: transition.order.totalAmount.toFixed(2),
          currency: transition.order.currency,
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
      this.assertActive(order.status);
      this.assertDraftItems(order);
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

  private async confirmProductItem(
    locationId: string,
    orderId: string,
    orderItemId: string,
  ): Promise<OrderTransition> {
    return this.inTransaction(async (tx) => {
      await this.lockOrder(tx, orderId);
      return this.confirmProductItemsInTransaction(
        locationId,
        orderId,
        [orderItemId],
        tx,
      );
    });
  }

  private async confirmProductItemsInTransaction(
    locationId: string,
    orderId: string,
    orderItemIds: string[],
    tx: Prisma.TransactionClient,
    occurredAt = new Date(),
  ): Promise<OrderTransition> {
    const order = await this.findInTransaction(tx, locationId, orderId);
    this.assertActive(order.status);
    const targetIds = new Set(orderItemIds);
    const items = order.items.filter((row) => targetIds.has(row.id));
    if (items.length !== targetIds.size) {
      throw new AppException(
        ErrorCode.ORDER_ITEM_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    }
    const pending: OrderWithItems['items'] = [];
    for (const item of items) {
      if (!item) {
        throw new AppException(
          ErrorCode.ORDER_ITEM_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      }
      if (item.status === OrderItemStatus.CONFIRMED) continue;
      if (
        item.status !== OrderItemStatus.DRAFT ||
        item.type !== OrderItemType.PRODUCT ||
        !item.catalogItemId
      ) {
        throw new AppException(
          ErrorCode.ORDER_ITEM_NOT_DRAFT,
          HttpStatus.CONFLICT,
        );
      }
      pending.push(item);
    }
    if (pending.length === 0) return { order, changed: false };

    const productIds = pending.map((item) => item.catalogItemId!);
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
    const sellerIds = [
      ...new Set(
        pending.flatMap((item) =>
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
        HttpStatus.CONFLICT,
      );
    }
    const byProduct = new Map(products.map((row) => [row.productId, row]));
    const saleLines: InventorySaleLine[] = pending.map((item) => {
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
      occurredAt,
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
    const commissionLines: ProductOrderCommissionLine[] = pending.flatMap(
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
      occurredAt,
      order.currency,
      commissionLines,
      tx,
    );
    await tx.orderItem.updateMany({
      where: { id: { in: pending.map((item) => item.id) } },
      data: {
        status: OrderItemStatus.CONFIRMED,
        confirmedAt: occurredAt,
        occurredAt,
      },
    });
    return {
      order: await this.findInTransaction(tx, locationId, orderId),
      changed: true,
    };
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
      this.assertActive(order.status);
      await this.earnings.reverseForProductOrder(
        locationId,
        orderId,
        reason,
        actor,
        tx,
      );
      await this.inventory.reverseSale(locationId, orderId, new Date(), tx);
      await tx.orderItem.updateMany({
        where: {
          orderId,
          status: { not: OrderItemStatus.REVERSED },
        },
        data: { status: OrderItemStatus.REVERSED },
      });
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

  private async reverseProductItem(
    locationId: string,
    orderId: string,
    orderItemId: string,
    reason: string,
    actor: AuditActor,
  ): Promise<OrderTransition> {
    return this.inTransaction(async (tx) => {
      await this.lockOrder(tx, orderId);
      const order = await this.findInTransaction(tx, locationId, orderId);
      this.assertActive(order.status);
      const item = order.items.find((row) => row.id === orderItemId);
      if (!item) {
        throw new AppException(
          ErrorCode.ORDER_ITEM_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      }
      if (item.status === OrderItemStatus.REVERSED) {
        return { order, changed: false };
      }
      if (
        item.status !== OrderItemStatus.CONFIRMED ||
        item.type !== OrderItemType.PRODUCT
      ) {
        throw new AppException(
          ErrorCode.ORDER_STATUS_INVALID,
          HttpStatus.CONFLICT,
        );
      }
      await this.earnings.reverseForProductOrderItem(
        locationId,
        orderId,
        orderItemId,
        reason,
        actor,
        tx,
      );
      await this.inventory.reverseSaleItem(
        locationId,
        orderId,
        orderItemId,
        new Date(),
        tx,
      );
      await tx.orderItem.update({
        where: { id: orderItemId },
        data: { status: OrderItemStatus.REVERSED },
      });
      return {
        order: await this.refreshTotals(tx, locationId, orderId),
        changed: true,
      };
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

  private async resolveProductItems(
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
      existing?.items.map((item) => [
        item.catalogItemId,
        item.customUnitPrice,
      ]) ?? [],
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

  private assertActive(status: OrderStatus): void {
    if (status !== OrderStatus.ACTIVE) {
      throw new AppException(ErrorCode.ORDER_NOT_ACTIVE, HttpStatus.CONFLICT);
    }
  }

  private assertDraftItems(order: OrderWithItems): void {
    if (order.items.some((item) => item.status !== OrderItemStatus.DRAFT)) {
      throw new AppException(
        ErrorCode.ORDER_ITEM_NOT_DRAFT,
        HttpStatus.CONFLICT,
      );
    }
  }

  private async refreshTotals(
    tx: Prisma.TransactionClient,
    locationId: string,
    orderId: string,
  ): Promise<OrderWithItems> {
    const order = await this.findInTransaction(tx, locationId, orderId);
    const totals = this.compute.totals(
      order.items
        .filter((item) => item.status !== OrderItemStatus.REVERSED)
        .map((item) => ({
          listUnitPrice: item.listUnitPrice,
          listLineTotal: item.quantity.mul(item.listUnitPrice),
          customUnitPrice: item.customUnitPrice,
          unitPrice: item.unitPrice,
          lineSubtotal: item.lineSubtotal,
          discountTotal: item.discountTotal,
          lineTotal: item.lineTotal,
        })),
    );
    return tx.order.update({
      where: { id: orderId },
      data: totals,
      include: orderInclude,
    });
  }

  private async ensureBookingOrder(
    booking: BookingWithItems,
    actor: AuditActor,
    tx: Prisma.TransactionClient,
  ): Promise<OrderWithItems> {
    const location = await this.locations.findById(booking.locationId);
    await tx.order.upsert({
      where: { bookingId: booking.id },
      update: {
        clientId: booking.clientId,
        clientName: this.clientName(
          booking.clientFirstName,
          booking.clientLastName,
        ),
        clientPhone: booking.clientPhone,
      },
      create: {
        locationId: booking.locationId,
        bookingId: booking.id,
        clientId: booking.clientId,
        clientName: this.clientName(
          booking.clientFirstName,
          booking.clientLastName,
        ),
        clientPhone: booking.clientPhone,
        currency: location.currency,
        occurredAt: booking.endAt,
        createdById: actor.id ?? null,
        createdByName: actor.name,
      },
    });
    return this.findByBookingInTransaction(tx, booking.locationId, booking.id);
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

  private async findByBookingInTransaction(
    tx: Prisma.TransactionClient,
    locationId: string,
    bookingId: string,
  ): Promise<OrderWithItems> {
    const order = await tx.order.findUnique({
      where: { bookingId },
      include: orderInclude,
    });
    if (!order || order.locationId !== locationId) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  private clientName(firstName: string, lastName: string): string {
    return `${firstName} ${lastName}`.trim();
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
