import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { I18nModule } from '../../shared/i18n/i18n.module.js';
import { RateLimitModule } from '../../shared/rate-limit/rate-limit.module.js';
import { AccessModule } from '../access/access.module.js';
import { BillingCoreModule } from '../billing/billing-core.module.js';
import { CalendarModule } from '../calendar/calendar.module.js';
import { ClientsModule } from '../clients/clients.module.js';
import { LocationModule } from '../location/location.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { PayrollModule } from '../payroll/payroll.module.js';
import { ProductsModule } from '../products/products.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ReviewsModule } from '../reviews/reviews.module.js';
import { PricingModule } from '../pricing/pricing.module.js';
import { ServiceCatalogModule } from '../services/catalog/service-catalog.module.js';
import { StaffModule } from '../staff/staff.module.js';
import { BookingCreateFacade } from './booking-create.facade.js';
import { BookingsFacade } from './bookings.facade.js';
import { BookingsController } from './controllers/bookings.controller.js';
import { BookingClientController } from './controllers/booking-client.controller.js';
import { PublicSlotsController } from './controllers/public-slots.controller.js';
import { BookingsExportService } from './export/services/bookings-export.service.js';
import { BookingClientTokenService } from './services/booking-client-token.service.js';
import { BookingClientService } from './services/booking-client.service.js';
import { BookingAccessService } from './services/booking-access.service.js';
import { BookingCronService } from './services/booking-cron.service.js';
import { BookingEventsService } from './services/booking-events.service.js';
import { BookingReservationService } from './services/booking-reservation.service.js';
import { BookingRepricingService } from './services/write/booking-repricing.service.js';
import { BookingSchedulingService } from './services/booking-scheduling.service.js';
import { BookingSelectionService } from './services/booking-selection.service.js';
import { BookingSlotLockService } from './services/booking-slot-lock.service.js';
import { BookingStaffLoadService } from './services/booking-staff-load.service.js';
import { BookingStaffingPreviewService } from './services/booking-staffing-preview.service.js';
import { PublicSlotPricingService } from './services/public-slot-pricing.service.js';
import { BookingWriteLockService } from './services/booking-write-lock.service.js';
import { BookingClientLinkService } from './services/write/booking-client-link.service.js';
import { BookingLifecycleService } from './services/write/booking-lifecycle.service.js';
import { BookingMutationService } from './services/write/booking-mutation.service.js';
import { BookingPaymentService } from './services/write/booking-payment.service.js';
import { BookingRescheduleService } from './services/write/booking-reschedule.service.js';
import { PublicBookingRateLimiter } from './services/public-booking-rate-limiter.js';
import { BookingCalendarReadService } from './services/read/booking-calendar-read.service.js';
import { BookingHistoryReadService } from './services/read/booking-history-read.service.js';
import { BookingPaymentReadService } from './services/read/booking-payment-read.service.js';
import { BookingPriceRuleStatsService } from './services/read/booking-price-rule-stats.service.js';
import { BookingPromotionReportService } from './services/read/booking-promotion-report.service.js';
import { BookingReadService } from './services/read/booking-read.service.js';
import { BookingSetupService } from './services/setup/booking-setup.service.js';
import { BookingStaffNotificationService } from './services/booking-staff-notification.service.js';
import { JwtBookingClientStrategy } from './strategies/jwt-booking-client.strategy.js';

@Module({
  imports: [
    PassportModule,
    AccessModule,
    BillingCoreModule,
    LocationModule,
    CalendarModule,
    ClientsModule,
    StaffModule,
    PayrollModule,
    PricingModule,
    ServiceCatalogModule,
    ProductsModule,
    OrdersModule,
    PaymentsModule,
    ReviewsModule,
    NotificationsModule,
    I18nModule,
    RateLimitModule,
  ],
  controllers: [
    BookingsController,
    BookingClientController,
    PublicSlotsController,
  ],
  providers: [
    BookingClientService,
    BookingAccessService,
    BookingReservationService,
    BookingRepricingService,
    BookingSelectionService,
    BookingSchedulingService,
    BookingSlotLockService,
    BookingStaffLoadService,
    PublicSlotPricingService,
    BookingStaffingPreviewService,
    BookingEventsService,
    BookingStaffNotificationService,
    BookingWriteLockService,
    BookingLifecycleService,
    BookingRescheduleService,
    BookingClientLinkService,
    BookingPaymentService,
    BookingPaymentReadService,

    BookingsFacade,
    BookingCreateFacade,
    BookingClientTokenService,
    BookingCronService,
    BookingMutationService,
    BookingCalendarReadService,
    BookingReadService,
    BookingPriceRuleStatsService,
    BookingPromotionReportService,
    BookingHistoryReadService,
    BookingSetupService,
    BookingsExportService,
    PublicBookingRateLimiter,
    JwtBookingClientStrategy,
  ],
  exports: [
    BookingClientTokenService,
    BookingCalendarReadService,
    BookingCreateFacade,
    BookingsFacade,
    BookingAccessService,
  ],
})
export class BookingsModule {}
