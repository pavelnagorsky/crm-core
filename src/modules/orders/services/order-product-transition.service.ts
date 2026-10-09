import { createHash } from 'crypto';
import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common';
import {
  OrderItemStatus,
  OrderItemType,
  OrderStatus,
  Prisma,
} from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { PrismaErrorCode } from '../../../shared/database/prisma-error-codes.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { InventoryService } from '../../inventory/inventory.service.js';
import { InventorySaleLine } from '../../inventory/interfaces/inventory-sale-line.interface.js';
import { ProductOrderCommissionLine } from '../../payroll/earnings/interfaces/product-order-commission-line.interface.js';
import { StaffEarningsService } from '../../payroll/earnings/staff-earnings.service.js';
import { ProductsService } from '../../products/products.service.js';
import { StaffService } from '../../staff/staff.service.js';
import { ConfirmOrderItemsDto } from '../dto/confirm-order-items.dto.js';
import { orderInclude } from '../constants/order-include.constant.js';
import { OrderTransition } from '../interfaces/order-transition.interface.js';
import { OrderWithItems } from '../interfaces/order-with-items.interface.js';
import { OrderPersistenceService } from './order-persistence.service.js';

const CONFIRM_PRODUCT_ITEMS_OPERATION = 'CONFIRM_PRODUCT_ITEMS';

@Injectable()
export class OrderProductTransitionService {
  constructor(
    private readonly db: DatabaseService,
    private readonly products: ProductsService,
    private readonly inventory: InventoryService,
    private readonly staff: StaffService,
    private readonly earnings: StaffEarningsService,
    private readonly persistence: OrderPersistenceService,
  ) {}

  async confirmProductItem(
    locationId: string,
    orderId: string,
    orderItemId: string,
  ): Promise<OrderTransition> {
    return this.persistence.inTransaction(async (tx) => {
      await this.persistence.lockOrder(tx, orderId);
      return this.confirmProductItemsInTransaction(
        locationId,
        orderId,
        [orderItemId],
        tx,
        undefined,
        { allowAlreadyConfirmed: true },
      );
    });
  }

  async confirmItems(
    locationId: string,
    orderId: string,
    dto: ConfirmOrderItemsDto,
  ): Promise<OrderTransition> {
    this.assertUniqueOrderItemIds(dto.itemIds);
    const idempotencyKey = dto.idempotencyKey.trim();
    if (!idempotencyKey) {
      throw new BadRequestException(
        'idempotencyKey is required for group confirmation',
      );
    }
    const requestHash = this.confirmItemsRequestHash(
      locationId,
      orderId,
      dto.itemIds,
    );
    const operation = {
      locationId,
      orderId,
      idempotencyKey,
      operationType: CONFIRM_PRODUCT_ITEMS_OPERATION,
      requestHash,
    };

    try {
      return await this.persistence.inTransaction(async (tx) => {
        await this.persistence.lockOrder(tx, orderId);
        const locked = await this.persistence.findInTransaction(
          tx,
          locationId,
          orderId,
        );
        await tx.orderOperation.create({ data: operation });
        return this.confirmProductItemsInTransaction(
          locationId,
          orderId,
          dto.itemIds,
          tx,
          undefined,
          { order: locked },
        );
      });
    } catch (error) {
      const prismaError = error as { code?: string };
      if (prismaError.code === PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION) {
        return {
          order: await this.resolveIdempotentConfirmItems(
            locationId,
            orderId,
            idempotencyKey,
            requestHash,
          ),
          changed: false,
        };
      }
      throw error;
    }
  }

  async void(
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
    return this.persistence.inTransaction(async (tx) => {
      await this.persistence.lockOrder(tx, orderId);
      const order = await this.persistence.findInTransaction(
        tx,
        locationId,
        orderId,
      );
      if (order.status === OrderStatus.VOIDED) {
        return { order, changed: false };
      }
      this.assertActive(order.status);
      this.assertStandaloneOrder(order);
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

  async reverseProductItem(
    locationId: string,
    orderId: string,
    orderItemId: string,
    reason: string,
    actor: AuditActor,
  ): Promise<OrderTransition> {
    return this.persistence.inTransaction(async (tx) => {
      await this.persistence.lockOrder(tx, orderId);
      const order = await this.persistence.findInTransaction(
        tx,
        locationId,
        orderId,
      );
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
        order: await this.persistence.refreshTotals(tx, locationId, orderId),
        changed: true,
      };
    });
  }

  async confirmProductItemsInTransaction(
    locationId: string,
    orderId: string,
    orderItemIds: string[],
    tx: Prisma.TransactionClient,
    occurredAt = new Date(),
    options: { allowAlreadyConfirmed?: boolean; order?: OrderWithItems } = {},
  ): Promise<OrderTransition> {
    const order =
      options.order ??
      (await this.persistence.findInTransaction(tx, locationId, orderId));
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
      if (item.status === OrderItemStatus.CONFIRMED) {
        if (options.allowAlreadyConfirmed) continue;
        throw new AppException(
          ErrorCode.ORDER_ITEM_NOT_DRAFT,
          HttpStatus.CONFLICT,
        );
      }
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
      order: await this.persistence.findInTransaction(tx, locationId, orderId),
      changed: true,
    };
  }

  private assertUniqueOrderItemIds(orderItemIds: string[]): void {
    if (new Set(orderItemIds).size === orderItemIds.length) return;
    throw new AppException(
      ErrorCode.ORDER_DUPLICATE_ITEM,
      HttpStatus.BAD_REQUEST,
    );
  }

  private confirmItemsRequestHash(
    locationId: string,
    orderId: string,
    orderItemIds: string[],
  ): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          locationId,
          orderId,
          itemIds: [...orderItemIds].sort(),
        }),
      )
      .digest('hex');
  }

  private async resolveIdempotentConfirmItems(
    locationId: string,
    orderId: string,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<OrderWithItems> {
    const operation = await this.db.orderOperation.findUnique({
      where: {
        locationId_idempotencyKey: {
          locationId,
          idempotencyKey,
        },
      },
    });
    if (
      !operation ||
      operation.orderId !== orderId ||
      operation.operationType !== CONFIRM_PRODUCT_ITEMS_OPERATION ||
      operation.requestHash !== requestHash
    ) {
      throw new AppException(
        ErrorCode.ORDER_IDEMPOTENCY_CONFLICT,
        HttpStatus.CONFLICT,
      );
    }
    return this.persistence.findById(locationId, orderId);
  }

  private assertActive(status: OrderStatus): void {
    if (status !== OrderStatus.ACTIVE) {
      throw new AppException(ErrorCode.ORDER_NOT_ACTIVE, HttpStatus.CONFLICT);
    }
  }

  private assertStandaloneOrder(order: OrderWithItems): void {
    if (order.bookingId) {
      throw new AppException(
        ErrorCode.ORDER_LINKED_BOOKING_VOID_NOT_ALLOWED,
        HttpStatus.CONFLICT,
      );
    }
  }
}
