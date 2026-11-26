import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { ACTIVE_LOCATION_WHERE } from '../../../shared/database/active-business.where.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { AuditActionType } from '../../audit/enums/audit-action-type.enum.js';
import { AuditEvent } from '../../audit/enums/audit-event.enum.js';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { orderInclude } from '../constants/order-include.constant.js';
import { CreateOrderDto } from '../dto/create-order.dto.js';
import { OrderWithItems } from '../interfaces/order-with-items.interface.js';
import { saleRequestHash } from '../rules/sale-request-hash.js';
import { NESTED_PAYMENT_KEY_PREFIX } from '../../payments/constants/payment.constants.js';
import { OrderAuditService } from './order-audit.service.js';
import { OrderDraftService } from './order-draft.service.js';
import { OrderPaymentService } from './order-payment.service.js';
import { OrderPersistenceService } from './order-persistence.service.js';
import { OrderProductTransitionService } from './order-product-transition.service.js';
import { OrderProductPricingService } from './order-product-pricing.service.js';

@Injectable()
export class OrderCreationService {
  constructor(
    private readonly db: DatabaseService,
    private readonly drafts: OrderDraftService,
    private readonly persistence: OrderPersistenceService,
    private readonly transitions: OrderProductTransitionService,
    private readonly audits: OrderAuditService,
    private readonly orderPayments: OrderPaymentService,
    private readonly productPricing: OrderProductPricingService,
  ) {}
  async create(
    locationId: string,
    dto: CreateOrderDto,
    actor: AuditActor,
    canOverridePrice = false,
  ): Promise<OrderWithItems> {
    if (dto.payment && !dto.confirmImmediately) {
      throw new BadRequestException(
        'payment is accepted only with confirmImmediately',
      );
    }
    if (dto.confirmImmediately) {
      return this.createAndConfirmProductSale(
        locationId,
        dto,
        actor,
        canOverridePrice,
      );
    }
    const { order, draft } = await this.persistence.inTransaction(
      async (tx) => {
        const draft = await this.drafts.resolveDraft(
          locationId,
          dto,
          actor,
          undefined,
          tx,
          undefined,
          canOverridePrice,
        );
        const created = await tx.order.create({
          data: {
            locationId,
            bookingId: draft.bookingId,
            clientId: draft.clientId,
            clientName: draft.clientName,
            clientPhone: draft.clientPhone,
            currency: draft.location.currency,
            occurredAt: draft.occurredAt,
            note: draft.note,
            promoCode: draft.promoCode,
            createdById: actor.id ?? null,
            createdByName: actor.name,
            ...draft.totals,
            items: { create: draft.items },
          },
          select: { id: true },
        });
        // The draft shows the price of now: promotions, the client discount, the promo code.
        await this.productPricing.repriceDrafts(
          tx,
          locationId,
          created.id,
          this.drafts.requestChoices(dto.items),
        );
        const order = await this.persistence.refreshTotals(
          tx,
          locationId,
          created.id,
          { incrementVersion: false },
        );
        return { order, draft };
      },
    );
    this.audits.record(
      draft.location.brandId,
      locationId,
      order.id,
      AuditEvent.ORDER_CREATED,
      AuditActionType.CREATE,
      actor,
      this.createdPayload(order),
    );
    return order;
  }

  /** ORDER_CREATED: totals and the promo code of the sale. */
  private createdPayload(order: OrderWithItems): Record<string, unknown> {
    return {
      totalAmount: order.totalAmount.toFixed(2),
      currency: order.currency,
      promoCode: order.promoCode,
    };
  }

  private async createAndConfirmProductSale(
    locationId: string,
    dto: CreateOrderDto,
    actor: AuditActor,
    canOverridePrice = false,
  ): Promise<OrderWithItems> {
    const idempotencyKey = dto.idempotencyKey;
    if (!idempotencyKey) {
      throw new BadRequestException(
        'idempotencyKey is required for confirmed product sales',
      );
    }
    if (dto.expectedTotal == null)
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        HttpStatus.BAD_REQUEST,
        { field: 'expectedTotal' },
      );
    const expectedTotal = new Prisma.Decimal(dto.expectedTotal);
    const requestHash = saleRequestHash(locationId, dto);
    const now = new Date();
    const paymentRequest = dto.payment
      ? await this.orderPayments.prepareRequest(locationId, dto.payment, now)
      : null;
    const result = await this.persistence.inTransaction(async (tx) => {
      await this.persistence.lockSaleRequest(tx, locationId, idempotencyKey);
      const existing = await tx.order.findFirst({
        where: { location: ACTIVE_LOCATION_WHERE, locationId, idempotencyKey },
        include: orderInclude,
      });
      if (existing) {
        // Older sales have no original request hash. Their current, editable items
        // cannot prove a match, so fail without creating or conducting another sale.
        if (existing.creationRequestHash !== requestHash) {
          throw new AppException(
            ErrorCode.ORDER_IDEMPOTENCY_CONFLICT,
            HttpStatus.CONFLICT,
            { orderId: existing.id },
          );
        }
        return {
          order: existing,
          draft: null,
          created: false,
          payment: null,
        };
      }
      const draft = await this.drafts.resolveDraft(
        locationId,
        dto,
        actor,
        undefined,
        tx,
        undefined,
        canOverridePrice,
      );
      const order = await tx.order.create({
        data: {
          locationId,
          bookingId: null,
          clientId: draft.clientId,
          clientName: draft.clientName,
          clientPhone: draft.clientPhone,
          currency: draft.location.currency,
          occurredAt: draft.occurredAt,
          note: draft.note,
          promoCode: draft.promoCode,
          idempotencyKey,
          creationRequestHash: requestHash,
          createdById: actor.id ?? null,
          createdByName: actor.name,
          ...draft.totals,
          items: { create: draft.items },
        },
        include: orderInclude,
      });
      const transition =
        await this.transitions.confirmProductItemsInTransaction(
          locationId,
          order.id,
          order.items.map((item) => item.id),
          tx,
          {
            expectedTotal,
            ...this.drafts.requestChoices(dto.items),
            saleAt: order.occurredAt,
          },
          order.occurredAt,
        );
      const payment = paymentRequest
        ? await this.orderPayments.recordInLockedSale(
            tx,
            transition.order,
            paymentRequest,
            NESTED_PAYMENT_KEY_PREFIX.SALE + idempotencyKey,
            requestHash,
            actor,
            now,
          )
        : null;
      return { order: transition.order, draft, created: true, payment };
    });
    if (result.created && result.draft) {
      this.audits.record(
        result.draft.location.brandId,
        locationId,
        result.order.id,
        AuditEvent.ORDER_CREATED,
        AuditActionType.CREATE,
        actor,
        this.createdPayload(result.order),
      );
      this.orderPayments.publish(result.payment, actor);
    }
    return result.order;
  }
}
