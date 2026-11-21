import { HttpStatus, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  OrderItemStatus,
  OrderItemType,
  OrderReturnStatus,
  Prisma,
  ProductUnit,
} from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaErrorCode } from '../../../shared/database/prisma-error-codes.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { AUDIT_EVENT } from '../../audit/constants/audit.constants.js';
import { AuditActionType } from '../../audit/enums/audit-action-type.enum.js';
import { AuditEntity } from '../../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../../audit/enums/audit-event.enum.js';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../../audit/interfaces/audit-log-event.interface.js';
import { InventoryFacade } from '../../inventory/inventory.facade.js';
import { LocationService } from '../../location/services/location.service.js';
import { StaffEarningsService } from '../../payroll/earnings/services/staff-earnings.service.js';
import { OrderPricingCalculator } from '../calculators/order-pricing.calculator.js';
import { CreateOrderReturnDto } from '../dto/create-order-return.dto.js';
import { OrderWithItems } from '../interfaces/order-with-items.interface.js';
import { OrderStateRules } from '../rules/order-state.rules.js';
import { NESTED_PAYMENT_KEY_PREFIX } from '../../payments/constants/payment.constants.js';
import { PaymentChange } from '../../payments/interfaces/payment-change.interface.js';
import { PaymentsFacade } from '../../payments/payments.facade.js';
import { assertPaymentDate } from '../../payments/rules/payment-occurred-at.rules.js';
import { LockedOrder } from '../interfaces/locked-order.interface.js';
import { OrderReturnResult } from '../interfaces/order-return-result.interface.js';
import {
  lockedOrderAmountDue,
  returnRefundAmount,
} from '../rules/order-payment-due.rules.js';
import { OrderLockService } from './order-lock.service.js';
import { OrderPersistenceService } from './order-persistence.service.js';
import { ACTIVE_LOCATION_WHERE } from '../../../shared/database/active-business.where.js';

@Injectable()
export class OrderReturnService {
  constructor(
    private readonly inventory: InventoryFacade,
    private readonly earnings: StaffEarningsService,
    private readonly persistence: OrderPersistenceService,
    private readonly compute: OrderPricingCalculator,
    private readonly stateAssertions: OrderStateRules,
    private readonly locations: LocationService,
    private readonly eventEmitter: EventEmitter2,
    private readonly payments: PaymentsFacade,
    private readonly locks: OrderLockService,
  ) {}

  async create(
    locationId: string,
    orderId: string,
    dto: CreateOrderReturnDto,
    actor: AuditActor,
  ): Promise<OrderReturnResult> {
    const idempotencyKey = dto.idempotencyKey;
    const reason = dto.reason;
    const requestHash = this.requestHash(orderId, dto);
    if (!idempotencyKey || !reason) {
      throw new AppException(
        ErrorCode.ORDER_VOID_REASON_REQUIRED,
        HttpStatus.BAD_REQUEST,
      );
    }
    const location = await this.locations.findById(locationId);

    try {
      return await this.persistence.inTransaction(async (tx) => {
        // Booking first, then the order: the refund depends on the visit's services.
        const { order, visit } = await this.locks.lockOrderWithVisit(
          tx,
          locationId,
          orderId,
        );
        this.stateAssertions.assertActive(order.status);
        const occurredAt = dto.occurredAt
          ? new Date(dto.occurredAt)
          : new Date();
        if (occurredAt.getTime() > Date.now()) {
          throw new AppException(
            ErrorCode.ORDER_FUTURE_DATE,
            HttpStatus.BAD_REQUEST,
          );
        }
        const returnItems = this.resolveReturnItems(order, dto);
        const orderReturn = await tx.orderReturn.create({
          data: {
            locationId,
            orderId,
            reason,
            occurredAt,
            idempotencyKey,
            requestHash,
            createdById: actor.id ?? null,
            createdByName: actor.name,
            items: { create: returnItems },
          },
          include: { items: true },
        });

        for (const item of orderReturn.items) {
          await this.inventory.reverseSaleItemQuantity(
            locationId,
            orderId,
            item.orderItemId,
            item.quantity,
            occurredAt,
            tx,
            item.id,
          );
          if (item.sellerStaffId) {
            await this.earnings.reverseForProductOrderItemAmount(
              locationId,
              orderId,
              item.orderItemId,
              item.lineTotal,
              reason,
              actor,
              tx,
              item.id,
            );
          }
        }

        const updated = await this.persistence.refreshTotals(
          tx,
          locationId,
          orderId,
        );
        const refund = await this.refundWithReturn(
          tx,
          { order: updated, visit },
          orderReturn,
          dto,
          requestHash,
          actor,
        );
        this.emitUpdated(location.brandId, locationId, orderId, actor, {
          orderReturnId: orderReturn.id,
          reason,
          totalAmount: updated.totalAmount.toFixed(2),
          currency: updated.currency,
          itemChanges: {
            added: [],
            removed: [],
            changed: orderReturn.items.map((item) => ({
              orderItemId: item.orderItemId,
              returnedQuantity: item.quantity.toFixed(3),
              returnedTotal: item.lineTotal.toFixed(2),
            })),
          },
        });
        return { order: updated, refund };
      });
    } catch (error) {
      if (!this.isReturnIdempotencyError(error)) {
        throw error;
      }
      const existing = await this.resolveIdempotentReturn(
        locationId,
        orderId,
        idempotencyKey,
        requestHash,
      );
      return { order: existing, refund: null };
    }
  }

  /**
   * Money goes back together with the goods: what was paid beyond the amount due after the
   * return, at most the return total, dated like the return. Money that was never received
   * is not refunded. `refund` is required only when something goes back; otherwise it is
   * ignored, since the client asks for the method whenever something is paid.
   */
  private async refundWithReturn(
    tx: Prisma.TransactionClient,
    locked: LockedOrder,
    orderReturn: Prisma.OrderReturnGetPayload<{ include: { items: true } }>,
    dto: CreateOrderReturnDto,
    requestHash: string,
    actor: AuditActor,
  ): Promise<PaymentChange | null> {
    const { order } = locked;
    const returnTotal = orderReturn.items.reduce(
      (sum, item) => sum.plus(item.lineTotal),
      new Prisma.Decimal(0),
    );
    const amount = returnRefundAmount(
      await this.payments.paidAmount(tx, order.id),
      lockedOrderAmountDue(locked),
      returnTotal,
    );
    if (amount.lte(0)) return null;
    if (!dto.refund)
      throw new AppException(
        ErrorCode.ORDER_RETURN_REFUND_REQUIRED,
        HttpStatus.BAD_REQUEST,
      );
    // The same bounds as any payment date.
    assertPaymentDate(orderReturn.occurredAt, new Date());
    return this.payments.refund(tx, {
      locationId: order.locationId,
      orderId: order.id,
      currency: order.currency,
      method: dto.refund.method,
      amount,
      occurredAt: orderReturn.occurredAt,
      reason: orderReturn.reason,
      idempotencyKey: NESTED_PAYMENT_KEY_PREFIX.RETURN + dto.idempotencyKey,
      requestHash,
      orderReturnId: orderReturn.id,
      actor,
    });
  }

  private resolveReturnItems(
    order: OrderWithItems,
    dto: CreateOrderReturnDto,
  ): Prisma.OrderReturnItemUncheckedCreateWithoutReturnInput[] {
    const ids = dto.items.map((item) => item.orderItemId);
    if (new Set(ids).size !== ids.length) {
      throw new AppException(
        ErrorCode.ORDER_DUPLICATE_ITEM,
        HttpStatus.BAD_REQUEST,
      );
    }
    return dto.items.map((dtoItem) => {
      const orderItem = order.items.find(
        (item) => item.id === dtoItem.orderItemId,
      );
      if (!orderItem) {
        throw new AppException(
          ErrorCode.ORDER_ITEM_NOT_FOUND,
          HttpStatus.NOT_FOUND,
        );
      }
      if (
        orderItem.status !== OrderItemStatus.CONFIRMED ||
        orderItem.type !== OrderItemType.PRODUCT
      ) {
        throw new AppException(
          ErrorCode.ORDER_STATUS_INVALID,
          HttpStatus.CONFLICT,
        );
      }
      const quantity = new Prisma.Decimal(dtoItem.quantity);
      if (quantity.lte(0)) {
        throw new AppException(
          ErrorCode.ORDER_QUANTITY_INVALID,
          HttpStatus.BAD_REQUEST,
        );
      }
      this.assertQuantityMatchesUnit(quantity, orderItem.unit);
      const returnedQuantity = orderItem.returnItems
        .filter((item) => item.return.status === OrderReturnStatus.POSTED)
        .reduce((sum, item) => sum.plus(item.quantity), new Prisma.Decimal(0));
      const remainingQuantity = orderItem.quantity.minus(returnedQuantity);
      if (quantity.gt(remainingQuantity)) {
        throw new AppException(
          ErrorCode.ORDER_RETURN_QUANTITY_EXCEEDS_REMAINING,
          HttpStatus.BAD_REQUEST,
        );
      }
      const price = this.compute.priceLine(
        quantity,
        orderItem.listUnitPrice,
        orderItem.customUnitPrice,
      );
      return {
        orderItemId: orderItem.id,
        productLocationId: orderItem.productLocationId,
        productId: orderItem.catalogItemId,
        categoryId: orderItem.categoryId,
        title: orderItem.title,
        sku: orderItem.sku,
        unit: orderItem.unit,
        quantity,
        listUnitPrice: price.listUnitPrice,
        customUnitPrice: price.customUnitPrice,
        unitPrice: price.unitPrice,
        lineSubtotal: price.lineSubtotal,
        discountTotal: price.discountTotal,
        lineTotal: price.lineTotal,
        unitCostSnapshot: orderItem.unitCostSnapshot,
        lineCostSnapshot:
          orderItem.lineCostSnapshot == null
            ? null
            : MoneyUtils.allocateCumulative(
                orderItem.lineCostSnapshot,
                orderItem.quantity,
                quantity,
                returnedQuantity,
                orderItem.returnItems
                  .filter(
                    (item) => item.return.status === OrderReturnStatus.POSTED,
                  )
                  .reduce(
                    (sum, item) => sum.plus(item.lineCostSnapshot ?? 0),
                    new Prisma.Decimal(0),
                  ),
              ),
        sellerStaffId: orderItem.sellerStaffId,
        sellerName: orderItem.sellerName,
      };
    });
  }

  private assertQuantityMatchesUnit(
    quantity: Prisma.Decimal,
    unit: ProductUnit | null,
  ): void {
    if (unit !== ProductUnit.PIECE || quantity.isInteger()) return;
    throw new AppException(
      ErrorCode.ORDER_QUANTITY_MUST_BE_WHOLE,
      HttpStatus.BAD_REQUEST,
    );
  }

  private async resolveIdempotentReturn(
    locationId: string,
    orderId: string,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<OrderWithItems> {
    const existing = await this.persistence.inTransaction(async (tx) => {
      const orderReturn = await tx.orderReturn.findUnique({
        where: {
          location: ACTIVE_LOCATION_WHERE,
          locationId_idempotencyKey: { locationId, idempotencyKey },
        },
      });
      if (
        !orderReturn ||
        orderReturn.orderId !== orderId ||
        orderReturn.requestHash !== requestHash
      ) {
        throw new AppException(
          ErrorCode.ORDER_IDEMPOTENCY_CONFLICT,
          HttpStatus.CONFLICT,
        );
      }
      return this.persistence.findInTransaction(tx, locationId, orderId);
    });
    return existing;
  }

  private requestHash(orderId: string, dto: CreateOrderReturnDto): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          orderId,
          reason: dto.reason,
          occurredAt: dto.occurredAt ?? null,
          items: dto.items
            .map((item) => ({
              orderItemId: item.orderItemId,
              quantity: item.quantity,
            }))
            .sort((left, right) =>
              left.orderItemId.localeCompare(right.orderItemId),
            ),
          // Only when present, so returns without a refund keep their earlier hash.
          ...(dto.refund ? { refund: { method: dto.refund.method } } : {}),
        }),
      )
      .digest('hex');
  }

  private isReturnIdempotencyError(error: unknown): boolean {
    const prismaError = error as {
      code?: string;
      meta?: { target?: string[] | string };
    };
    if (prismaError.code !== PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION) {
      return false;
    }
    const target = prismaError.meta?.target;
    if (!target) return true;
    const columns = Array.isArray(target) ? target : [target];
    return columns.includes('locationId') && columns.includes('idempotencyKey');
  }

  private emitUpdated(
    brandId: string,
    locationId: string,
    entityId: string,
    actor: AuditActor,
    payload: Record<string, unknown>,
  ): void {
    this.eventEmitter.emit(AUDIT_EVENT, {
      brandId,
      locationId,
      entityType: AuditEntity.ORDER,
      entityId,
      eventType: AuditEvent.ORDER_UPDATED,
      actionType: AuditActionType.MODIFY,
      occurredAt: new Date(),
      actor,
      payload,
    } satisfies AuditLogEvent);
  }
}
