import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DatabaseService } from '../../database/database.service.js';
import { AppException } from '../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../shared/validation/error-codes.enum.js';
import { FilesService } from '../files/files.service.js';
import { BookingChannelStatus } from './enums/booking-channel-status.enum.js';
import { SlugAvailabilityReason } from './enums/slug-availability-reason.enum.js';
import { BookingPageWithCover } from './interfaces/booking-page-with-cover.interface.js';
import { SlugAvailability } from './interfaces/slug-availability.interface.js';
import { SaveBookingPageDto } from './dto/save-booking-page.dto.js';
import { classifySlug } from './booking-page-slug.js';
import { sanitizeBookingHtml } from './booking-html.js';
import { toBookingFormColumns } from './booking-form.js';
import { BookingChannelPublishService, publishedAtFor } from './booking-channel-publish.service.js';
import { rethrowPrisma } from './rethrow-prisma.js';

const COVER_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const HTML_MAX_LENGTH = 20_000;
const SLUG_LOOKUP_MAX_LENGTH = 80;

const pageInclude = { coverFile: true } satisfies Prisma.BookingPageInclude;

@Injectable()
export class BookingPagesService {
  private readonly logger = new Logger(BookingPagesService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly filesService: FilesService,
    private readonly publishService: BookingChannelPublishService,
  ) {}

  async list(businessId: string): Promise<BookingPageWithCover[]> {
    return this.db.bookingPage.findMany({
      where: { businessId },
      include: pageInclude,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findInBusiness(businessId: string, pageId: string): Promise<BookingPageWithCover> {
    const page = await this.db.bookingPage.findFirst({
      where: { id: pageId, businessId },
      include: pageInclude,
    });
    if (!page) throw new AppException(ErrorCode.BOOKING_PAGE_NOT_FOUND, HttpStatus.NOT_FOUND);
    return page;
  }

  async checkSlug(businessId: string, rawSlug: string, pageId?: string): Promise<SlugAvailability> {
    const slug = rawSlug.trim().toLowerCase();
    const kind = classifySlug(slug);
    if (kind === SlugAvailabilityReason.INVALID) return { isAvailable: false, reason: SlugAvailabilityReason.INVALID };
    if (kind === SlugAvailabilityReason.RESERVED) return { isAvailable: false, reason: SlugAvailabilityReason.RESERVED };
    const existing = await this.db.bookingPage.findUnique({
      where: { slug },
      select: { id: true, businessId: true },
    });
    if (!existing || (existing.id === pageId && existing.businessId === businessId)) {
      return { isAvailable: true, reason: null };
    }
    return { isAvailable: false, reason: SlugAvailabilityReason.TAKEN };
  }

  async create(businessId: string, dto: SaveBookingPageDto): Promise<BookingPageWithCover> {
    await this.assertSlugAvailable(businessId, dto.slug);
    const coverFileId = await this.resolveCover(businessId, dto.coverFileId);
    try {
      const page = await this.db.bookingPage.create({
        data: { businessId, ...this.content(dto, coverFileId) },
        include: pageInclude,
      });
      this.logger.log(`booking page created: id=${page.id} businessId=${businessId} slug=${page.slug}`);
      return page;
    } catch (error: unknown) {
      rethrowPrisma(error, ErrorCode.BOOKING_PAGE_SLUG_TAKEN, ErrorCode.BOOKING_PAGE_NOT_FOUND);
    }
  }

  async update(businessId: string, pageId: string, dto: SaveBookingPageDto): Promise<BookingPageWithCover> {
    await this.findInBusiness(businessId, pageId);
    await this.assertSlugAvailable(businessId, dto.slug, pageId);
    const coverFileId = await this.resolveCover(businessId, dto.coverFileId);
    try {
      return await this.db.bookingPage.update({
        where: { id: pageId },
        data: this.content(dto, coverFileId),
        include: pageInclude,
      });
    } catch (error: unknown) {
      rethrowPrisma(error, ErrorCode.BOOKING_PAGE_SLUG_TAKEN, ErrorCode.BOOKING_PAGE_NOT_FOUND);
    }
  }

  async changeStatus(
    businessId: string,
    pageId: string,
    status: BookingChannelStatus,
  ): Promise<BookingPageWithCover> {
    const page = await this.findInBusiness(businessId, pageId);
    await this.publishService.assertTransition(businessId, page.status, status);
    const updated = await this.db.bookingPage.update({
      where: { id: pageId },
      data: { status, publishedAt: publishedAtFor(status) },
      include: pageInclude,
    });
    this.logger.log(`booking page status: id=${pageId} businessId=${businessId} status=${status}`);
    return updated;
  }

  async delete(businessId: string, pageId: string): Promise<void> {
    await this.findInBusiness(businessId, pageId);
    await this.db.bookingPage.delete({ where: { id: pageId } });
    this.logger.log(`booking page deleted: id=${pageId} businessId=${businessId}`);
  }

  async getPublishedBySlug(slug: string): Promise<BookingPageWithCover> {
    if (slug.length > SLUG_LOOKUP_MAX_LENGTH) {
      throw new AppException(ErrorCode.BOOKING_PAGE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    const normalized = slug.trim().toLowerCase();
    if (classifySlug(normalized) !== 'OK') {
      throw new AppException(ErrorCode.BOOKING_PAGE_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    const page = await this.db.bookingPage.findFirst({
      where: { slug: normalized, status: BookingChannelStatus.PUBLISHED },
      include: pageInclude,
    });
    if (!page) throw new AppException(ErrorCode.BOOKING_PAGE_NOT_FOUND, HttpStatus.NOT_FOUND);
    return page;
  }

  private async assertSlugAvailable(businessId: string, slug: string, pageId?: string): Promise<void> {
    const availability = await this.checkSlug(businessId, slug, pageId);
    if (availability.reason === SlugAvailabilityReason.INVALID) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST);
    }
    if (availability.reason === SlugAvailabilityReason.RESERVED) {
      throw new AppException(ErrorCode.BOOKING_PAGE_SLUG_RESERVED, HttpStatus.BAD_REQUEST);
    }
    if (!availability.isAvailable) {
      throw new AppException(ErrorCode.BOOKING_PAGE_SLUG_TAKEN, HttpStatus.CONFLICT);
    }
  }

  private async resolveCover(businessId: string, fileId: string | null): Promise<string | null> {
    if (!fileId) return null;
    const file = await this.filesService.findInBusiness(businessId, fileId);
    if (!COVER_MIME_TYPES.has(file.mimeType)) {
      throw new AppException(ErrorCode.BOOKING_PAGE_COVER_INVALID, HttpStatus.UNPROCESSABLE_ENTITY);
    }
    return file.id;
  }

  private content(dto: SaveBookingPageDto, coverFileId: string | null) {
    const html = sanitizeBookingHtml(dto.html);
    if (html.length > HTML_MAX_LENGTH) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, HttpStatus.BAD_REQUEST);
    }
    return {
      title: dto.title,
      slug: dto.slug.trim().toLowerCase(),
      tagline: dto.tagline,
      html,
      metaTitle: dto.metaTitle,
      metaDescription: dto.metaDescription,
      coverFileId,
      ...toBookingFormColumns(dto.form),
    };
  }
}
