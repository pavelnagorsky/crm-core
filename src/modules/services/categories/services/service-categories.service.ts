import {
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ServiceCategory } from '@prisma/client';
import { DatabaseService } from '../../../../database/database.service.js';
import { PrismaErrorCode } from '../../../../shared/database/prisma-error-codes.js';
import { AppException } from '../../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../../shared/validation/error-codes.enum.js';
import { AUDIT_EVENT } from '../../../audit/constants/audit.constants.js';
import { AuditActionType } from '../../../audit/enums/audit-action-type.enum.js';
import { AuditEntity } from '../../../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../../../audit/enums/audit-event.enum.js';
import { SERVICE_CATEGORY_AUDIT_FIELDS } from '../../../audit/fields/service-category.fields.js';
import { AuditActor } from '../../../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../../../audit/interfaces/audit-log-event.interface.js';
import { diffFields } from '../../../audit/utils/diff-fields.js';
import { CreateServiceCategoryDto } from '../dto/create-service-category.dto.js';
import { UpdateServiceCategoryDto } from '../dto/update-service-category.dto.js';

@Injectable()
export class ServiceCategoriesService {
  private readonly logger = new Logger(ServiceCategoriesService.name);
  constructor(
    private readonly db: DatabaseService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async createCategory(
    locationId: string,
    dto: CreateServiceCategoryDto,
    actor: AuditActor,
  ): Promise<ServiceCategory> {
    try {
      const category = await this.db.serviceCategory.create({
        data: {
          locationId,
          name: dto.name,
          description: dto.description?.trim() || null,
          sortOrder: dto.sortOrder ?? 0,
        },
      });
      this.logger.log(
        `service category created: id=${category.id} locationId=${locationId}`,
      );
      const event: AuditLogEvent = {
        locationId,
        entityType: AuditEntity.SERVICE,
        entityId: category.id,
        eventType: AuditEvent.SERVICE_CATEGORY_CREATED,
        actionType: AuditActionType.CREATE,
        occurredAt: new Date(),
        actor,
        payload: {
          name: category.name,
          ...(category.description
            ? { description: category.description }
            : {}),
        },
      };
      this.eventEmitter.emit(AUDIT_EVENT, event);
      return category;
    } catch (e: any) {
      if (e?.code === PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION)
        throw new AppException(
          ErrorCode.CATEGORY_NAME_EXISTS,
          HttpStatus.CONFLICT,
        );
      throw e;
    }
  }

  async updateCategory(
    locationId: string,
    categoryId: string,
    dto: UpdateServiceCategoryDto,
    actor: AuditActor,
  ): Promise<ServiceCategory> {
    const existing = await this.db.serviceCategory.findFirst({
      where: { id: categoryId, locationId },
    });
    if (!existing) throw new NotFoundException('Service category not found');

    try {
      const category = await this.db.serviceCategory.update({
        where: { id: categoryId },
        data: {
          name: dto.name,
          description: dto.description?.trim() || null,
          sortOrder: dto.sortOrder ?? existing.sortOrder,
        },
      });
      const changes = diffFields(
        existing,
        category,
        SERVICE_CATEGORY_AUDIT_FIELDS,
      );
      if (changes.length > 0) {
        this.logger.log(
          `service category updated: id=${categoryId} locationId=${locationId} fields=${changes.map((change) => change.field).join(',')}`,
        );
        const event: AuditLogEvent = {
          locationId,
          entityType: AuditEntity.SERVICE,
          entityId: categoryId,
          eventType: AuditEvent.SERVICE_CATEGORY_UPDATED,
          actionType: AuditActionType.MODIFY,
          occurredAt: new Date(),
          actor,
          payload: { changes },
        };
        this.eventEmitter.emit(AUDIT_EVENT, event);
      }
      return category;
    } catch (e: any) {
      if (e?.code === PrismaErrorCode.UNIQUE_CONSTRAINT_VIOLATION)
        throw new AppException(
          ErrorCode.CATEGORY_NAME_EXISTS,
          HttpStatus.CONFLICT,
        );
      throw e;
    }
  }

  async listCategories(locationId: string): Promise<ServiceCategory[]> {
    return this.db.serviceCategory.findMany({
      where: { locationId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async deleteCategory(
    locationId: string,
    categoryId: string,
    actor: AuditActor,
  ): Promise<void> {
    const category = await this.db.serviceCategory.findFirst({
      where: { id: categoryId, locationId },
    });
    if (!category) throw new NotFoundException('Service category not found');
    await this.db.serviceCategory.delete({ where: { id: categoryId } });
    this.logger.log(
      `service category deleted: id=${categoryId} locationId=${locationId}`,
    );
    const event: AuditLogEvent = {
      locationId,
      entityType: AuditEntity.SERVICE,
      entityId: categoryId,
      eventType: AuditEvent.SERVICE_CATEGORY_DELETED,
      actionType: AuditActionType.DELETE,
      occurredAt: new Date(),
      actor,
      payload: { name: category.name },
    };
    this.eventEmitter.emit(AUDIT_EVENT, event);
  }
}
