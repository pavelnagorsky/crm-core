import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AuditLog, Prisma } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import {
  activeBrandSql,
  activeLocationSql,
} from '../../../shared/database/active-business.sql.js';
import { CountRow } from '../../../shared/database/interfaces/count-row.interface.js';
import { PaginatedResult } from '../../../shared/interfaces/paginated-result.interface.js';
import { AUDIT_EVENT } from '../constants/audit.constants.js';
import { AuditHistoryRequestDto } from '../dto/audit-history-request.dto.js';
import { AuditLogItemDto } from '../dto/audit-log-item.dto.js';
import type { AuditLogEvent } from '../interfaces/audit-log-event.interface.js';
import { AuditRenderer } from '../rendering/audit.renderer.js';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly renderer: AuditRenderer,
  ) {}

  @OnEvent(AUDIT_EVENT, { async: true, suppressErrors: true })
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
    return this.getHistory(
      Prisma.sql`audit."brandId" = ${brandId} AND ${activeBrandSql(Prisma.sql`audit."brandId"`)}`,
      dto,
    );
  }

  async getLocationHistory(
    locationId: string,
    dto: AuditHistoryRequestDto,
  ): Promise<PaginatedResult<AuditLogItemDto>> {
    return this.getHistory(
      Prisma.sql`audit."locationId" = ${locationId} AND ${activeLocationSql(Prisma.sql`audit."locationId"`)}`,
      dto,
    );
  }

  private async getHistory(
    scope: Prisma.Sql,
    dto: AuditHistoryRequestDto,
  ): Promise<PaginatedResult<AuditLogItemDto>> {
    const conditions = [scope];
    if (dto.entityType)
      conditions.push(Prisma.sql`audit."entityType"::text = ${dto.entityType}`);
    if (dto.entityId)
      conditions.push(Prisma.sql`audit."entityId" = ${dto.entityId}`);
    const where = Prisma.join(conditions, ' AND ');
    const [logs, [count]] = await this.db.$transaction([
      this.db.$queryRaw<
        AuditLog[]
      >`SELECT audit.* FROM "AuditLog" audit WHERE ${where}
        ORDER BY audit."occurredAt" DESC, audit."id" DESC
        LIMIT ${dto.pageSize} OFFSET ${(dto.page - 1) * dto.pageSize}`,
      this.db.$queryRaw<
        CountRow[]
      >`SELECT COUNT(*) AS "totalItems" FROM "AuditLog" audit WHERE ${where}`,
    ]);

    const items = logs.map((log) =>
      AuditLogItemDto.fromEntity(
        log,
        this.renderer.render(log, dto.lang),
        this.renderer.eventTitle(log.eventType, dto.lang),
      ),
    );

    return { items, totalItems: Number(count.totalItems) };
  }
}
