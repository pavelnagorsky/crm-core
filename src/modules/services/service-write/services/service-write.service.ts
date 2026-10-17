import {
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, ServiceStatus } from '@prisma/client';
import { DatabaseService } from '../../../../database/database.service.js';
import { PrismaErrorCode } from '../../../../shared/database/prisma-error-codes.js';
import { AppException } from '../../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../../shared/validation/error-codes.enum.js';
import { AUDIT_EVENT } from '../../../audit/constants/audit.constants.js';
import { AuditActionType } from '../../../audit/enums/audit-action-type.enum.js';
import { AuditEntity } from '../../../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../../../audit/enums/audit-event.enum.js';
import {
  SERVICE_AUDIT_FIELDS,
  toServiceAuditShape,
} from '../../../audit/fields/service.fields.js';
import { AuditActor } from '../../../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../../../audit/interfaces/audit-log-event.interface.js';
import { diffFields } from '../../../audit/utils/diff-fields.js';
import { LocationService } from '../../../location/services/location.service.js';
import { ServiceWithImage } from '../../catalog/interfaces/service-with-image.interface.js';
import { CreateServiceDto } from '../dto/create-service.dto.js';
import { UpdateServiceDto } from '../dto/update-service.dto.js';

const serviceAuditInclude = {
  imageFile: true,
  category: { select: { name: true } },
} satisfies Prisma.ServiceInclude;

@Injectable()
export class ServiceWriteService {
  private readonly logger = new Logger(ServiceWriteService.name);
  constructor(
    private readonly db: DatabaseService,
    private readonly eventEmitter: EventEmitter2,
    private readonly locationService: LocationService,
  ) {}

  async create(
    locationId: string,
    dto: CreateServiceDto,
    actor: AuditActor,
  ): Promise<ServiceWithImage> {
    const service = await this.db.service.create({
      data: {
        locationId,
        categoryId: dto.categoryId ?? null,
        imageFileId: dto.imageFileId ?? null,
        title: dto.title,
        description: dto.description ?? null,
        price: dto.price,
        durationMinutes: dto.durationMinutes,
        bufferMinutes: dto.bufferMinutes ?? 0,
        status: dto.status ?? ServiceStatus.ACTIVE,
        sortOrder: dto.sortOrder ?? 0,
      },
      include: serviceAuditInclude,
    });
    const { currency } = await this.locationService.getLocale(locationId);
    this.logger.log(
      `service created: id=${service.id} locationId=${locationId}`,
    );
    const event: AuditLogEvent = {
      locationId,
      entityType: AuditEntity.SERVICE,
      entityId: service.id,
      eventType: AuditEvent.SERVICE_CREATED,
      actionType: AuditActionType.CREATE,
      occurredAt: new Date(),
      actor,
      payload: {
        title: service.title,
        price: service.price.toString(),
        durationMinutes: service.durationMinutes,
        currency,
        ...(service.category?.name
          ? { categoryName: service.category.name }
          : {}),
        ...(service.imageFile?.fileName
          ? { imageName: service.imageFile.fileName }
          : {}),
      },
    };
    this.eventEmitter.emit(AUDIT_EVENT, event);
    return service;
  }

  async update(
    locationId: string,
    serviceId: string,
    dto: UpdateServiceDto,
    actor: AuditActor,
  ): Promise<ServiceWithImage> {
    const old = await this.findInLocation(locationId, serviceId);
    const service = await this.db.service.update({
      where: { id: serviceId },
      data: {
        categoryId: dto.categoryId,
        imageFileId: dto.imageFileId,
        title: dto.title,
        description: dto.description,
        price: dto.price,
        durationMinutes: dto.durationMinutes,
        bufferMinutes: dto.bufferMinutes,
        sortOrder: dto.sortOrder,
      },
      include: serviceAuditInclude,
    });
    const changes = diffFields(
      toServiceAuditShape(old),
      toServiceAuditShape(service),
      SERVICE_AUDIT_FIELDS,
    );
    if (changes.length > 0) {
      const currency = changes.some((change) => change.field === 'price')
        ? (await this.locationService.getLocale(locationId)).currency
        : undefined;
      this.logger.log(
        `service updated: id=${serviceId} locationId=${locationId} fields=${changes.map((change) => change.field).join(',')}`,
      );
      const event: AuditLogEvent = {
        locationId,
        entityType: AuditEntity.SERVICE,
        entityId: serviceId,
        eventType: AuditEvent.SERVICE_UPDATED,
        actionType: AuditActionType.MODIFY,
        occurredAt: new Date(),
        actor,
        payload: { changes, ...(currency ? { currency } : {}) },
      };
      this.eventEmitter.emit(AUDIT_EVENT, event);
    }
    return service;
  }

  private async findInLocation(locationId: string, serviceId: string) {
    const service = await this.db.service.findFirst({
      where: { id: serviceId, locationId },
      include: serviceAuditInclude,
    });
    if (!service) throw new NotFoundException('Service not found');
    return service;
  }

  async changeStatus(
    locationId: string,
    serviceId: string,
    status: ServiceStatus,
    actor: AuditActor,
  ): Promise<void> {
    const service = await this.findInLocation(locationId, serviceId);
    if (service.status === status) {
      throw new AppException(
        ErrorCode.SERVICE_STATUS_ALREADY_SET,
        HttpStatus.CONFLICT,
      );
    }
    await this.db.service.update({
      where: { id: serviceId },
      data: { status },
    });
    this.logger.log(
      `service status: id=${serviceId} locationId=${locationId} status=${status}`,
    );
    const event: AuditLogEvent = {
      locationId,
      entityType: AuditEntity.SERVICE,
      entityId: serviceId,
      eventType: AuditEvent.SERVICE_UPDATED,
      actionType: AuditActionType.MODIFY,
      occurredAt: new Date(),
      actor,
      payload: {
        changes: [{ field: 'status', from: service.status, to: status }],
      },
    };
    this.eventEmitter.emit(AUDIT_EVENT, event);
  }

  async delete(
    locationId: string,
    serviceId: string,
    actor: AuditActor,
  ): Promise<void> {
    const service = await this.findInLocation(locationId, serviceId);
    try {
      await this.db.service.delete({ where: { id: serviceId } });
    } catch (e: any) {
      if (e?.code === PrismaErrorCode.FOREIGN_KEY_VIOLATION) {
        throw new AppException(ErrorCode.SERVICE_IN_USE, HttpStatus.CONFLICT);
      }
      throw e;
    }
    this.logger.log(
      `service deleted: id=${serviceId} locationId=${locationId}`,
    );
    const event: AuditLogEvent = {
      locationId,
      entityType: AuditEntity.SERVICE,
      entityId: serviceId,
      eventType: AuditEvent.SERVICE_DELETED,
      actionType: AuditActionType.DELETE,
      occurredAt: new Date(),
      actor,
      payload: { title: service.title },
    };
    this.eventEmitter.emit(AUDIT_EVENT, event);
  }
}
