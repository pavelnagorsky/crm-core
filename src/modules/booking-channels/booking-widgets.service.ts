import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { BookingWidget } from '@prisma/client';
import { DatabaseService } from '../../database/database.service.js';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../shared/validation/error-codes.enum.js';
import { BookingChannelStatus } from './enums/booking-channel-status.enum.js';
import { SaveBookingWidgetDto } from './dto/save-booking-widget.dto.js';
import { isDomainAllowed, normalizeAllowedDomains } from './allowed-domains.js';
import { toBookingFormColumns } from './booking-form.js';
import { BookingChannelPublishService, publishedAtFor } from './booking-channel-publish.service.js';
import { rethrowPrisma } from './rethrow-prisma.js';

@Injectable()
export class BookingWidgetsService {
  private readonly logger = new Logger(BookingWidgetsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly publishService: BookingChannelPublishService,
  ) {}

  async list(businessId: string): Promise<BookingWidget[]> {
    return this.db.bookingWidget.findMany({
      where: { businessId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findInBusiness(businessId: string, widgetId: string): Promise<BookingWidget> {
    const widget = await this.db.bookingWidget.findFirst({ where: { id: widgetId, businessId } });
    if (!widget) throw new AppException(ErrorCode.BOOKING_WIDGET_NOT_FOUND, HttpStatus.NOT_FOUND);
    return widget;
  }

  async create(businessId: string, dto: SaveBookingWidgetDto): Promise<BookingWidget> {
    const allowedDomains = this.domains(dto.allowedDomains);
    await this.assertTitleAvailable(businessId, dto.title);
    try {
      const widget = await this.db.bookingWidget.create({
        data: { businessId, ...this.content(dto, allowedDomains) },
      });
      this.logger.log(`booking widget created: id=${widget.id} businessId=${businessId}`);
      return widget;
    } catch (error: unknown) {
      rethrowPrisma(error, ErrorCode.BOOKING_WIDGET_TITLE_EXISTS, ErrorCode.BOOKING_WIDGET_NOT_FOUND);
    }
  }

  async update(businessId: string, widgetId: string, dto: SaveBookingWidgetDto): Promise<BookingWidget> {
    await this.findInBusiness(businessId, widgetId);
    const allowedDomains = this.domains(dto.allowedDomains);
    await this.assertTitleAvailable(businessId, dto.title, widgetId);
    try {
      const widget = await this.db.bookingWidget.update({
        where: { id: widgetId },
        data: this.content(dto, allowedDomains),
      });
      this.logger.log(`booking widget updated: id=${widgetId} businessId=${businessId}`);
      return widget;
    } catch (error: unknown) {
      rethrowPrisma(error, ErrorCode.BOOKING_WIDGET_TITLE_EXISTS, ErrorCode.BOOKING_WIDGET_NOT_FOUND);
    }
  }

  async changeStatus(businessId: string, widgetId: string, status: BookingChannelStatus): Promise<BookingWidget> {
    const widget = await this.findInBusiness(businessId, widgetId);
    await this.publishService.assertTransition(businessId, widget.status, status);
    const updated = await this.db.bookingWidget.update({
      where: { id: widgetId },
      data: { status, publishedAt: publishedAtFor(status) },
    });
    this.logger.log(`booking widget status: id=${widgetId} businessId=${businessId} status=${status}`);
    return updated;
  }

  async delete(businessId: string, widgetId: string): Promise<void> {
    await this.findInBusiness(businessId, widgetId);
    await this.db.bookingWidget.delete({ where: { id: widgetId } });
    this.logger.log(`booking widget deleted: id=${widgetId} businessId=${businessId}`);
  }

  async getPublished(widgetId: string, origin?: string): Promise<BookingWidget> {
    const widget = await this.db.bookingWidget.findFirst({
      where: { id: widgetId, status: BookingChannelStatus.PUBLISHED },
    });
    if (!widget) throw new AppException(ErrorCode.BOOKING_WIDGET_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (!isDomainAllowed(widget.allowedDomains, origin)) {
      throw new AppException(ErrorCode.WIDGET_DOMAIN_NOT_ALLOWED, HttpStatus.FORBIDDEN);
    }
    return widget;
  }

  private async assertTitleAvailable(businessId: string, title: string, widgetId?: string): Promise<void> {
    const existing = await this.db.bookingWidget.findFirst({
      where: {
        businessId,
        titleKey: title.trim().toLowerCase(),
        ...(widgetId ? { NOT: { id: widgetId } } : {}),
      },
      select: { id: true },
    });
    if (existing) throw new AppException(ErrorCode.BOOKING_WIDGET_TITLE_EXISTS, HttpStatus.CONFLICT);
  }

  private domains(values: string[]): string[] {
    const normalized = normalizeAllowedDomains(values);
    if (!normalized) throw new AppException(ErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST);
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
