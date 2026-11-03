import { EventEmitter2 } from '@nestjs/event-emitter';
import { AUDIT_EVENT } from '../../audit/constants/audit.constants.js';
import { AuditActionType } from '../../audit/enums/audit-action-type.enum.js';
import { AuditEntity } from '../../audit/enums/audit-entity.enum.js';
import { AuditEvent } from '../../audit/enums/audit-event.enum.js';
import { AuditActor } from '../../audit/interfaces/audit-actor.interface.js';
import { AuditLogEvent } from '../../audit/interfaces/audit-log-event.interface.js';
import {
  auditSnapshot,
  auditSnapshotChanges,
} from '../../audit/utils/audit-snapshot.js';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { BookingWidget } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { ACTIVE_LOCATION_WHERE } from '../../../shared/database/active-business.where.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { BookingChannelStatus } from '../enums/booking-channel-status.enum.js';
import { SaveBookingWidgetDto } from '../dto/save-booking-widget.dto.js';
import {
  isDomainAllowed,
  normalizeAllowedDomains,
} from '../rules/allowed-domains.js';
import { toBookingFormColumns } from '../rendering/booking-form.js';
import {
  BookingChannelPublishService,
  publishedAtFor,
} from './booking-channel-publish.service.js';
import { rethrowPrisma } from '../utils/rethrow-prisma.js';

@Injectable()
export class BookingWidgetsService {
  private readonly logger = new Logger(BookingWidgetsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly publishService: BookingChannelPublishService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async list(locationId: string): Promise<BookingWidget[]> {
    return this.db.bookingWidget.findMany({
      where: { location: ACTIVE_LOCATION_WHERE, locationId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findInLocation(
    locationId: string,
    widgetId: string,
  ): Promise<BookingWidget> {
    const widget = await this.db.bookingWidget.findFirst({
      where: { location: ACTIVE_LOCATION_WHERE, id: widgetId, locationId },
    });
    if (!widget)
      throw new AppException(
        ErrorCode.BOOKING_WIDGET_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    return widget;
  }

  async create(
    locationId: string,
    dto: SaveBookingWidgetDto,
    actor: AuditActor,
  ): Promise<BookingWidget> {
    const allowedDomains = this.domains(dto.allowedDomains);
    await this.assertTitleAvailable(locationId, dto.title);
    try {
      const widget = await this.db.bookingWidget.create({
        data: { locationId, ...this.content(dto, allowedDomains) },
      });
      this.record(AuditEvent.BOOKING_WIDGET_CREATED, null, widget, actor);
      this.logger.log(
        `booking widget created: id=${widget.id} locationId=${locationId}`,
      );
      return widget;
    } catch (error: unknown) {
      rethrowPrisma(
        error,
        ErrorCode.BOOKING_WIDGET_TITLE_EXISTS,
        ErrorCode.BOOKING_WIDGET_NOT_FOUND,
      );
    }
  }

  async update(
    locationId: string,
    widgetId: string,
    dto: SaveBookingWidgetDto,
    actor: AuditActor,
  ): Promise<BookingWidget> {
    const old = await this.findInLocation(locationId, widgetId);
    const allowedDomains = this.domains(dto.allowedDomains);
    await this.assertTitleAvailable(locationId, dto.title, widgetId);
    try {
      const widget = await this.db.bookingWidget.update({
        where: { id: widgetId },
        data: this.content(dto, allowedDomains),
      });
      this.record(AuditEvent.BOOKING_WIDGET_UPDATED, old, widget, actor);
      this.logger.log(
        `booking widget updated: id=${widgetId} locationId=${locationId}`,
      );
      return widget;
    } catch (error: unknown) {
      rethrowPrisma(
        error,
        ErrorCode.BOOKING_WIDGET_TITLE_EXISTS,
        ErrorCode.BOOKING_WIDGET_NOT_FOUND,
      );
    }
  }

  async changeStatus(
    locationId: string,
    widgetId: string,
    status: BookingChannelStatus,
    actor: AuditActor,
  ): Promise<BookingWidget> {
    const widget = await this.findInLocation(locationId, widgetId);
    await this.publishService.assertTransition(
      locationId,
      widget.status,
      status,
    );
    const updated = await this.db.bookingWidget.update({
      where: { id: widgetId },
      data: { status, publishedAt: publishedAtFor(status) },
    });
    this.record(
      AuditEvent.BOOKING_WIDGET_STATUS_CHANGED,
      widget,
      updated,
      actor,
    );
    this.logger.log(
      `booking widget status: id=${widgetId} locationId=${locationId} status=${status}`,
    );
    return updated;
  }

  async delete(
    locationId: string,
    widgetId: string,
    actor: AuditActor,
  ): Promise<void> {
    const old = await this.findInLocation(locationId, widgetId);
    await this.db.bookingWidget.delete({ where: { id: widgetId } });
    this.record(AuditEvent.BOOKING_WIDGET_DELETED, old, null, actor);
    this.logger.log(
      `booking widget deleted: id=${widgetId} locationId=${locationId}`,
    );
  }

  async getPublished(
    widgetId: string,
    origin?: string,
  ): Promise<BookingWidget> {
    const widget = await this.db.bookingWidget.findFirst({
      where: {
        id: widgetId,
        status: BookingChannelStatus.PUBLISHED,
        location: ACTIVE_LOCATION_WHERE,
      },
    });
    if (!widget)
      throw new AppException(
        ErrorCode.BOOKING_WIDGET_NOT_FOUND,
        HttpStatus.NOT_FOUND,
      );
    if (!isDomainAllowed(widget.allowedDomains, origin)) {
      throw new AppException(
        ErrorCode.WIDGET_DOMAIN_NOT_ALLOWED,
        HttpStatus.FORBIDDEN,
      );
    }
    return widget;
  }

  private async assertTitleAvailable(
    locationId: string,
    title: string,
    widgetId?: string,
  ): Promise<void> {
    const existing = await this.db.bookingWidget.findFirst({
      where: {
        location: ACTIVE_LOCATION_WHERE,
        locationId,
        titleKey: title.trim().toLowerCase(),
        ...(widgetId ? { NOT: { id: widgetId } } : {}),
      },
      select: { id: true },
    });
    if (existing)
      throw new AppException(
        ErrorCode.BOOKING_WIDGET_TITLE_EXISTS,
        HttpStatus.CONFLICT,
      );
  }

  private domains(values: string[]): string[] {
    const normalized = normalizeAllowedDomains(values);
    if (!normalized)
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        HttpStatus.BAD_REQUEST,
      );
    return normalized;
  }

  private content(dto: SaveBookingWidgetDto, allowedDomains: string[]) {
    return {
      title: dto.title,
      titleKey: dto.title.trim().toLowerCase(),
      placement: dto.placement,
      trigger: dto.trigger,
      buttonPosition: dto.buttonPosition,
      allowedDomains,
      ...(dto.gtmId !== undefined ? { gtmId: dto.gtmId } : {}),
      ...(dto.yandexMetrikaId !== undefined
        ? { yandexMetrikaId: dto.yandexMetrikaId }
        : {}),
      ...toBookingFormColumns(dto.form),
    };
  }
  private record(
    eventType: AuditEvent,
    before: BookingWidget | null,
    after: BookingWidget | null,
    actor: AuditActor,
  ): void {
    const entity = after ?? before!;
    const fields = [
      'title',
      'status',
      'gtmId',
      'yandexMetrikaId',
      'palette',
      'customBackground',
      'customSurface',
      'customText',
      'customMuted',
      'customAccent',
      'customAccentText',
      'headline',
      'caption',
      'showStaff',
      'showBranding',
      'placement',
      'trigger',
      'buttonPosition',
      'allowedDomains',
    ] as const satisfies readonly (keyof BookingWidget)[];
    const changes =
      before && after
        ? auditSnapshotChanges(
            auditSnapshot(before, fields),
            auditSnapshot(after, fields),
          )
        : undefined;
    if (before && after && changes?.length === 0) return;
    this.eventEmitter.emit(AUDIT_EVENT, {
      locationId: entity.locationId,
      entityType: AuditEntity.BOOKING_WIDGET,
      entityId: entity.id,
      eventType,
      actionType:
        before == null
          ? AuditActionType.CREATE
          : after == null
            ? AuditActionType.DELETE
            : AuditActionType.MODIFY,
      occurredAt: new Date(),
      actor,
      payload: { title: entity.title, changes },
    } satisfies AuditLogEvent);
  }
}
