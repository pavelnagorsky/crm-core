import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common';
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
import { OrderAuditService } from './order-audit.service.js';
import { OrderDraftService } from './order-draft.service.js';
import { OrderPersistenceService } from './order-persistence.service.js';
import { OrderProductTransitionService } from './order-product-transition.service.js';

@Injectable()
export class OrderCreationService {
  constructor(
    private readonly db: DatabaseService,
    private readonly drafts: OrderDraftService,
    private readonly persistence: OrderPersistenceService,
    private readonly transitions: OrderProductTransitionService,
    private readonly audits: OrderAuditService,
  ) {}
  async create(
    locationId: string,
    dto: CreateOrderDto,
    actor: AuditActor,
    canOverridePrice = false,
  ): Promise<OrderWithItems> {
    if (dto.confirmImmediately) {
      return this.createAndConfirmProductSale(
        locationId,
        dto,
        actor,
        canOverridePrice,
      );
    }
    const draft = await this.drafts.resolveDraft(
      locationId,
      dto,
      actor,
      undefined,
      undefined,
      undefined,
      canOverridePrice,
    );
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
    this.audits.record(
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
    canOverridePrice = false,
  ): Promise<OrderWithItems> {
    const idempotencyKey = dto.idempotencyKey;
    if (!idempotencyKey) {
      throw new BadRequestException(
        'idempotencyKey is required for confirmed product sales',
      );
    }
    const requestHash = saleRequestHash(locationId, dto);
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
        return { order: existing, draft: null, created: false };
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
          order.occurredAt,
        );
      return { order: transition.order, draft, created: true };
    });
    if (result.created && result.draft) {
      this.audits.record(
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
}
