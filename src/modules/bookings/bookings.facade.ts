import { Injectable } from '@nestjs/common';
import { Booking, BookingTrafficTouch, CancelledBy } from '@prisma/client';
import { PaginatedResult } from '../../shared/interfaces/paginated-result.interface.js';
import { AuditActor } from '../audit/interfaces/audit-actor.interface.js';
import { LocationService } from '../location/services/location.service.js';
import { AddOrderItemsDto } from '../orders/dto/add-order-items.dto.js';
import { OrderProductItemDto } from '../orders/dto/order-product-item.dto.js';
import { OrderWithItems } from '../orders/interfaces/order-with-items.interface.js';
import { BookingResolveRequestDto } from './dto/booking-resolve-request.dto.js';
import { BookingSelectionResolution } from './interfaces/booking-selection-resolution.interface.js';
import { BookingSearchRequestDto } from './dto/booking-search-request.dto.js';
import { BookingSetup } from './interfaces/booking-setup.interface.js';
import { CancelBookingDto } from './dto/cancel-booking.dto.js';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto.js';
import { UpdateBookingDto } from './dto/update-booking.dto.js';
import { BookingStatus } from './enums/booking-status.enum.js';
import { BookingWithItems } from './interfaces/booking-with-items.interface.js';
import { BookingTrafficDetails } from './interfaces/booking-traffic-details.interface.js';
import { BookingMutationService } from './services/write/booking-mutation.service.js';
import { BookingReadService } from './services/read/booking-read.service.js';
import { BookingSetupService } from './services/setup/booking-setup.service.js';
import { BookingHistoryReadService } from './services/read/booking-history-read.service.js';
import { ClientBookingSummary } from './interfaces/client-booking-summary.interface.js';
import { StaffPopularServices } from './interfaces/staff-popular-services.interface.js';
import { PayBookingDto } from './dto/pay-booking.dto.js';
import { VisitPaymentResult } from './interfaces/visit-payment-result.interface.js';
import { VisitPaymentSummary } from './interfaces/visit-payment-summary.interface.js';
import { BookingPaymentReadService } from './services/read/booking-payment-read.service.js';
import { BookingPaymentService } from './services/write/booking-payment.service.js';
import { BookingPriceRuleStatsService } from './services/read/booking-price-rule-stats.service.js';
import { PriceRuleStats } from '../pricing/interfaces/price-rule-stats.interface.js';
import { PromotionMatchItem } from '../pricing/interfaces/promotion-match-item.interface.js';
import { PromotionNotReturnedRow } from '../pricing/interfaces/promotion-not-returned-row.interface.js';
import { PromotionPeriodTotals } from '../pricing/interfaces/promotion-period-totals.interface.js';
import { PromotionReport } from '../pricing/interfaces/promotion-report.interface.js';
import { BookingPromotionReportService } from './services/read/booking-promotion-report.service.js';

import { BookingStaffingPreviewService } from './services/booking-staffing-preview.service.js';
import { StaffingPreview } from './interfaces/staffing-preview.interface.js';
import { StaffingPreviewRequest } from './interfaces/staffing-preview-request.interface.js';
import { LocalPricingContextRequest } from './interfaces/local-pricing-context-request.interface.js';
import { PricingContextService } from '../pricing/services/pricing-context.service.js';
import { QuoteContext } from '../pricing/engine/interfaces/quote-context.interface.js';
import { TimeUtils } from '../../shared/time/time.utils.js';
@Injectable()
export class BookingsFacade {
  constructor(
    private readonly read: BookingReadService,
    private readonly setup: BookingSetupService,
    private readonly mutation: BookingMutationService,
    private readonly locations: LocationService,
    private readonly history: BookingHistoryReadService,
    private readonly payment: BookingPaymentService,
    private readonly paymentReads: BookingPaymentReadService,
    private readonly priceRuleStats: BookingPriceRuleStatsService,
    private readonly promotionReports: BookingPromotionReportService,
    private readonly staffingPreview: BookingStaffingPreviewService,
    private readonly pricingContext: PricingContextService,
  ) {}

  async getBookingSetup(
    locationId: string,
    options?: { listPrices?: boolean },
  ): Promise<BookingSetup> {
    return this.setup.getBookingSetup(locationId, options);
  }

  getClientBookingSummary(
    locationId: string,
    clientId: string,
  ): Promise<ClientBookingSummary> {
    return this.history.clientSummary(locationId, clientId);
  }

  getPopularServices(locationId: string): Promise<StaffPopularServices[]> {
    return this.history.popularServices(locationId);
  }

  /**
   * What each rule did to visits of the last 30 days (surcharge or discount, distinct
   * bookings; promotions also revenue, new clients and all-time usage), cancelled bookings
   * left out. Rules with nothing to show are absent from the map.
   */
  getPriceRuleStats(
    locationId: string,
    ruleIds: readonly string[],
    now = new Date(),
  ): Promise<Map<string, PriceRuleStats>> {
    return this.priceRuleStats.ruleStats(locationId, ruleIds, now);
  }

  /** Results of one promotion over visits since the given date (null: all time) up to now. */
  getPromotionReport(
    locationId: string,
    ruleId: string,
    since: Date | null,
    now = new Date(),
  ): Promise<PromotionReport> {
    return this.promotionReports.report(locationId, ruleId, since, now);
  }

  /** Clients who did not book again after a promotion visit, for the export. */
  getPromotionNotReturned(
    locationId: string,
    ruleId: string,
    now = new Date(),
  ): Promise<PromotionNotReturnedRow[]> {
    return this.promotionReports.notReturnedRows(locationId, ruleId, now);
  }

  /** All promotions of the location over visits in [from, to]. */
  getPromotionTotals(
    locationId: string,
    from: Date,
    to: Date,
  ): Promise<PromotionPeriodTotals> {
    return this.promotionReports.periodTotals(locationId, from, to);
  }

  /** Items of live bookings with a visit start in [from, to], for a promotion preview. */
  getPromotionMatchItems(
    locationId: string,
    from: Date,
    to: Date,
  ): Promise<PromotionMatchItem[]> {
    return this.promotionReports.matchItems(locationId, from, to);
  }

  async resolveBookingSelection(
    locationId: string,
    dto: BookingResolveRequestDto,
  ): Promise<BookingSelectionResolution> {
    return this.setup.resolveBookingSelection(locationId, dto);
  }

  async update(
    booking: BookingWithItems,
    actor: AuditActor,
    dto: UpdateBookingDto,
    canReplacePayment = false,
  ): Promise<BookingWithItems> {
    return this.mutation.update(booking, actor, dto, canReplacePayment);
  }

  /** Pays the visit: completes a started one, confirms products, records the payment. */
  pay(
    booking: BookingWithItems,
    dto: PayBookingDto,
    actor: AuditActor,
    canReplacePayment: boolean,
    participantStaffId?: string,
  ): Promise<VisitPaymentResult> {
    return this.payment.pay(
      booking,
      dto,
      actor,
      canReplacePayment,
      participantStaffId,
    );
  }

  /** Undoes a first payment of the visit by its author within 10 minutes. */
  undoPayment(
    booking: BookingWithItems,
    operationId: string,
    actor: AuditActor,
    participantStaffId?: string,
  ): Promise<void> {
    return this.payment.undo(
      booking,
      operationId,
      actor,
      new Date(),
      participantStaffId,
    );
  }

  getPaymentSummary(booking: BookingWithItems): Promise<VisitPaymentSummary> {
    return this.paymentReads.summary(booking);
  }

  async updateStatus(
    booking: BookingWithItems,
    actor: AuditActor,
    dto: UpdateBookingStatusDto,
  ): Promise<BookingWithItems> {
    return this.mutation.updateStatus(booking, actor, dto);
  }

  async addProduct(
    locationId: string,
    bookingId: string,
    actor: AuditActor,
    dto: OrderProductItemDto,
    canOverridePrice = false,
  ): Promise<OrderWithItems> {
    return this.mutation.addProduct(
      locationId,
      bookingId,
      actor,
      dto,
      canOverridePrice,
    );
  }

  async addProducts(
    locationId: string,
    bookingId: string,
    actor: AuditActor,
    dto: AddOrderItemsDto,
    canOverridePrice = false,
  ): Promise<OrderWithItems> {
    return this.mutation.addProducts(
      locationId,
      bookingId,
      actor,
      dto,
      canOverridePrice,
    );
  }

  async completeElapsed(now = new Date()): Promise<number> {
    return this.mutation.completeElapsed(now);
  }

  async findById(bookingId: string): Promise<BookingWithItems> {
    return this.read.findById(bookingId);
  }

  async findByIdInLocation(
    locationId: string,
    bookingId: string,
  ): Promise<BookingWithItems> {
    return this.read.findByIdInLocation(locationId, bookingId);
  }

  async search(
    locationId: string,
    dto: BookingSearchRequestDto,
    participantStaffId?: string,
  ): Promise<PaginatedResult<BookingWithItems>> {
    return this.read.search(
      locationId,
      dto,
      participantStaffId,
      await this.dayFilterTimezone(locationId, dto),
    );
  }

  findTrafficDetails(bookingId: string): Promise<BookingTrafficDetails> {
    return this.read.findTrafficDetails(bookingId);
  }

  findTrafficTouches(
    bookingIds: string[],
  ): Promise<Map<string, BookingTrafficTouch>> {
    return this.read.findTrafficTouches(bookingIds);
  }

  async cancel(
    booking: BookingWithItems,
    actor: AuditActor,
    cancelledBy: CancelledBy,
    dto: CancelBookingDto,
  ): Promise<Booking> {
    return this.mutation.cancel(booking, actor, cancelledBy, dto);
  }

  async delete(booking: BookingWithItems, actor: AuditActor): Promise<void> {
    return this.mutation.delete(booking, actor);
  }

  async getStatusCounts(
    locationId: string,
    participantStaffId?: string,
  ): Promise<{ status: BookingStatus; count: number }[]> {
    return this.read.getStatusCounts(locationId, participantStaffId);
  }

  /**
   * Who can take a visit at a local start and who the "any staff" rule gives (cabinet price
   * check): the same read and ranking booking creation uses.
   */
  previewStaffing(
    locationId: string,
    request: StaffingPreviewRequest,
  ): Promise<StaffingPreview> {
    return this.staffingPreview.preview(locationId, request);
  }

  /**
   * Promotions and the client discount of a visit as the price check sets it up: the
   * channel, the client, the code and when it is booked, all in the location time.
   */
  async localPricingContext(
    locationId: string,
    request: LocalPricingContextRequest,
  ): Promise<QuoteContext> {
    const location = await this.locations.getBookingSettings(locationId);
    return this.pricingContext.build({
      locationId,
      brandId: location.brandId,
      timezone: location.timezone,
      channel: request.channel,
      visitStartAt: TimeUtils.localToUtc(request.visitStart, location.timezone),
      clientId: request.clientId,
      promoCode: request.promoCode,
      now: request.bookedAt
        ? TimeUtils.localToUtc(request.bookedAt, location.timezone)
        : undefined,
    });
  }

  private async dayFilterTimezone(
    locationId: string,
    dto: BookingSearchRequestDto,
  ): Promise<string | undefined> {
    if (
      !dto.startDateFrom &&
      !dto.startDateTo &&
      !dto.createdDateFrom &&
      !dto.createdDateTo
    )
      return undefined;
    return (await this.locations.getLocale(locationId)).timezone;
  }
}
