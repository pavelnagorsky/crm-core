import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DatabaseService } from '../../database/database.service.js';
import { AuditRendererService } from './renderer/audit-renderer.service.js';
import type { AuditLogEvent } from './interfaces/audit-log-event.interface.js';
import { AuditHistoryRequestDto } from './dto/audit-history-request.dto.js';
import { AuditLogItemDto } from './dto/audit-log-item.dto.js';
import { PaginatedResult } from '../../shared/interfaces/paginated-result.interface.js';
import { OrderDirection } from '../../shared/enums/order-direction.enum.js';
import { stableOrderBy } from '../../shared/database/stable-order-by.js';
import { AUDIT_EVENT } from './audit.constants.js';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly renderer: AuditRendererService,
  ) {}

  @OnEvent(AUDIT_EVENT)
  async handleAuditEvent(event: AuditLogEvent): Promise<void> {
    const brandId = event.brandId ?? (await this.resolveBrandId(event));
    if (!brandId) {
      this.logger.error('Failed to persist audit log: missing brandId');
      return;
    }

    try {
      await this.db.auditLog.create({
        data: {
          brandId,
          locationId: event.locationId ?? null,
          entityType: event.entityType,
          entityId: event.entityId,
          eventType: event.eventType,
          actionType: event.actionType,
          occurredAt: event.occurredAt,
          actorId: event.actor.id ?? null,
          actorName: event.actor.name,
          actorRole: event.actor.role,
          payload: event.payload as object,
        },
      });
    } catch (err) {
      this.logger.error(
        'Failed to persist audit log',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  private async resolveBrandId(event: AuditLogEvent): Promise<string | null> {
    if (!event.locationId) return null;
    const location = await this.db.location.findUnique({
      where: { id: event.locationId },
      select: { brandId: true },
    });
    return location?.brandId ?? null;
  }

  async getBrandHistory(
    brandId: string,
    dto: AuditHistoryRequestDto,
  ): Promise<PaginatedResult<AuditLogItemDto>> {
    const where = {
      brandId,
      entityType: dto.entityType,
      entityId: dto.entityId,
    };

    const [logs, totalItems] = await this.db.$transaction([
      this.db.auditLog.findMany({
        where,
        orderBy: stableOrderBy(
          { occurredAt: OrderDirection.DESC },
          OrderDirection.DESC,
        ),
        skip: (dto.page - 1) * dto.pageSize,
        take: dto.pageSize,
      }),
      this.db.auditLog.count({ where }),
    ]);

    const items = logs.map((log) =>
      AuditLogItemDto.fromEntity(
        log,
        this.renderer.render(log, dto.lang),
        this.renderer.eventTitle(log.eventType, dto.lang),
      ),
    );

    return { items, totalItems };
  }

  async getLocationHistory(
    locationId: string,
    dto: AuditHistoryRequestDto,
  ): Promise<PaginatedResult<AuditLogItemDto>> {
    const where = {
      locationId,
      entityType: dto.entityType,
      entityId: dto.entityId,
    };

    const [logs, totalItems] = await this.db.$transaction([
      this.db.auditLog.findMany({
        where,
        orderBy: stableOrderBy(
          { occurredAt: OrderDirection.DESC },
          OrderDirection.DESC,
        ),
        skip: (dto.page - 1) * dto.pageSize,
        take: dto.pageSize,
      }),
      this.db.auditLog.count({ where }),
    ]);

    const items = logs.map((log) =>
      AuditLogItemDto.fromEntity(
        log,
        this.renderer.render(log, dto.lang),
        this.renderer.eventTitle(log.eventType, dto.lang),
      ),
    );

    return { items, totalItems };
  }
}
