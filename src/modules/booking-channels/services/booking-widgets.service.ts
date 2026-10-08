import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { BookingWidget } from '@prisma/client';
import { DatabaseService } from '../../../database/database.service.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { BookingChannelStatus } from '../enums/booking-channel-status.enum.js';
import { SaveBookingWidgetDto } from '../dto/save-booking-widget.dto.js';
import { isDomainAllowed, normalizeAllowedDomains } from '../rules/allowed-domains.js';
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
  ) {}

  async list(locationId: string): Promise<BookingWidget[]> {
    return this.db.bookingWidget.findMany({
      where: { locationId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findInLocation(
    locationId: string,
    widgetId: string,
  ): Promise<BookingWidget> {
    const widget = await this.db.bookingWidget.findFirst({
      where: { id: widgetId, locationId },
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
  ): Promise<BookingWidget> {
    const allowedDomains = this.domains(dto.allowedDomains);
    await this.assertTitleAvailable(locationId, dto.title);
    try {
      const widget = await this.db.bookingWidget.create({
        data: { locationId, ...this.content(dto, allowedDomains) },
      });
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
  ): Promise<BookingWidget> {
    await this.findInLocation(locationId, widgetId);
    const allowedDomains = this.domains(dto.allowedDomains);
    await this.assertTitleAvailable(locationId, dto.title, widgetId);
    try {
      const widget = await this.db.bookingWidget.update({
        where: { id: widgetId },
        data: this.content(dto, allowedDomains),
      });
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
    this.logger.log(
      `booking widget status: id=${widgetId} locationId=${locationId} status=${status}`,
    );
    return updated;
  }

  async delete(locationId: string, widgetId: string): Promise<void> {
    await this.findInLocation(locationId, widgetId);
    await this.db.bookingWidget.delete({ where: { id: widgetId } });
    this.logger.log(
      `booking widget deleted: id=${widgetId} locationId=${locationId}`,
    );
  }

  async getPublished(
    widgetId: string,
    origin?: string,
  ): Promise<BookingWidget> {
    const widget = await this.db.bookingWidget.findFirst({
      where: { id: widgetId, status: BookingChannelStatus.PUBLISHED },
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
      ...toBookingFormColumns(dto.form),
    };
  }
}
