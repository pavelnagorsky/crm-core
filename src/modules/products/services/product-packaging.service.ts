import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProductPackaging, ProductUnit } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DatabaseService } from '../../../database/database.service.js';
import { PrismaErrorCode } from '../../../shared/database/prisma-error-codes.js';
import { fitsDecimal } from '../../../shared/database/fits-decimal.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { AUDIT_EVENT } from '../../audit/constants/audit.constants.js';
import { AuditActionType } from '../../audit/enums/audit-action-type.enum.js';
import { AuditEntity } from '../../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../../audit/enums/audit-event.enum.js';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../../audit/interfaces/audit-log-event.interface.js';
import { CreateProductPackagingDto } from '../dto/create-product-packaging.dto.js';
import { ProductsService } from '../products.service.js';

@Injectable()
export class ProductPackagingService {
  constructor(
    private readonly db: DatabaseService,
    private readonly products: ProductsService,
    private readonly events: EventEmitter2,
  ) {}

  async create(
    brandId: string,
    productId: string,
    dto: CreateProductPackagingDto,
    actor: AuditActor,
  ): Promise<ProductPackaging> {
    try {
      const packaging = await this.db.$transaction(async (tx) => {
        const product = await this.products.resolveForPackagingCreation(
          brandId,
          productId,
          tx,
        );
        const factor = new Prisma.Decimal(dto.quantityInBaseUnit);
        if (
          !fitsDecimal(factor, 14, 3) ||
          factor.lte(0) ||
          (product.unit === ProductUnit.PIECE && !factor.isInteger())
        ) {
          throw new AppException(
            ErrorCode.PRODUCT_PACKAGING_FACTOR_INVALID,
            HttpStatus.BAD_REQUEST,
          );
        }
        return tx.productPackaging.create({
          data: {
            productId,
            name: dto.name.trim(),
            quantityInBaseUnit: factor,
          },
        });
      });
      this.emit(
        brandId,
        productId,
        packaging,
        actor,
        AuditEvent.PRODUCT_PACKAGING_CREATED,
      );
      return packaging;
    } catch (error) {
      if (
        (error as { code?: string } | null)?.code ===
        PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION
      ) {
        throw new AppException(
          ErrorCode.PRODUCT_PACKAGING_NAME_EXISTS,
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async changeStatus(
    brandId: string,
    productId: string,
    packagingId: string,
    isActive: boolean,
    actor: AuditActor,
  ): Promise<ProductPackaging> {
    const packaging = await this.db.productPackaging.findFirst({
      where: {
        id: packagingId,
        productId,
        product: { brandId },
      },
    });
    if (!packaging) throw new NotFoundException('Product packaging not found');
    if (packaging.isActive === isActive) return packaging;
    const updated = await this.db.productPackaging.update({
      where: { id: packagingId },
      data: { isActive },
    });
    this.emit(
      brandId,
      productId,
      updated,
      actor,
      AuditEvent.PRODUCT_PACKAGING_STATUS_CHANGED,
    );
    return updated;
  }

  resolveForReceipt(
    brandId: string,
    packagingIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<ProductPackaging[]> {
    return (tx ?? this.db).productPackaging.findMany({
      where: {
        id: { in: [...new Set(packagingIds)] },
        isActive: true,
        product: { brandId },
      },
    });
  }

  private emit(
    brandId: string,
    productId: string,
    packaging: ProductPackaging,
    actor: AuditActor,
    eventType: AuditEvent,
  ): void {
    this.events.emit(AUDIT_EVENT, {
      brandId,
      locationId: null,
      entityType: AuditEntity.PRODUCT,
      entityId: productId,
      eventType,
      actionType:
        eventType === AuditEvent.PRODUCT_PACKAGING_CREATED
          ? AuditActionType.CREATE
          : AuditActionType.MODIFY,
      occurredAt: new Date(),
      actor,
      payload: {
        packagingId: packaging.id,
        name: packaging.name,
        quantityInBaseUnit: packaging.quantityInBaseUnit.toFixed(3),
        isActive: packaging.isActive,
      },
    } satisfies AuditLogEvent);
  }
}
