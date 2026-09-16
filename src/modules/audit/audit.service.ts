import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DatabaseService } from '../../database/database.service.js';
import { AuditRendererService } from './renderer/audit-renderer.service.js';
import type { AuditLogEvent } from './interfaces/audit-log-event.interface.js';
import { AuditHistoryRequestDto } from './dto/audit-history-request.dto.js';
import { AuditLogItemDto } from './dto/audit-log-item.dto.js';
import { PaginatedResult } from '../../shared/interfaces/paginated-result.interface.js';
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
    try {
      await this.db.auditLog.create({
        data: {
          businessId: event.businessId,
          entityType: event.entityType,
          entityId: event.entityId,
          eventType: event.eventType,
          actorId: event.actor.id ?? null,
          actorName: event.actor.name,
          actorRole: event.actor.role,
          payload: event.payload as object,
        },
      });
    } catch (err) {
      this.logger.error('Failed to persist audit log', err);
    }
  }

  async getHistory(
    businessId: string,
    dto: AuditHistoryRequestDto,
  ): Promise<PaginatedResult<AuditLogItemDto>> {
    const where = {
      businessId,
      entityType: dto.entityType,
      entityId: dto.entityId,
    };

    const [logs, totalItems] = await this.db.$transaction([
      this.db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (dto.page - 1) * dto.pageSize,
        take: dto.pageSize,
      }),
      this.db.auditLog.count({ where }),
    ]);

    const items = logs.map((log) => AuditLogItemDto.fromEntity(log, this.renderer.render(log)));

    return { items, totalItems };
  }
}
