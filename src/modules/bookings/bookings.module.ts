import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { I18nModule } from '../../shared/i18n/i18n.module.js';
import { CalendarModule } from '../calendar/calendar.module.js';
import { ClientsModule } from '../clients/clients.module.js';
import { LocationModule } from '../location/location.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { PayrollModule } from '../payroll/payroll.module.js';
import { ServiceCatalogModule } from '../services/catalog/service-catalog.module.js';
import { StaffModule } from '../staff/staff.module.js';
import { BookingCreateFacade } from './booking-create.facade.js';
import { BookingsFacade } from './bookings.facade.js';
import { BookingsController } from './controllers/bookings.controller.js';
import { BookingsExportService } from './export/services/bookings-export.service.js';
import { BookingClientTokenService } from './services/booking-client-token.service.js';
import { BookingAccessService } from './services/booking-access.service.js';
import { BookingCronService } from './services/booking-cron.service.js';
import { BookingEventsService } from './services/booking-events.service.js';
import { BookingReservationService } from './services/booking-reservation.service.js';
import { BookingSchedulingService } from './services/booking-scheduling.service.js';
import { BookingSelectionService } from './services/booking-selection.service.js';
import { BookingSlotLockService } from './services/booking-slot-lock.service.js';
import { BookingWriteLockService } from './services/booking-write-lock.service.js';
import { BookingLifecycleService } from './services/write/booking-lifecycle.service.js';
import { BookingMutationService } from './services/write/booking-mutation.service.js';
import { BookingRescheduleService } from './services/write/booking-reschedule.service.js';
import { PublicBookingRateLimiter } from './services/public-booking-rate-limiter.js';
import { BookingCalendarReadService } from './services/read/booking-calendar-read.service.js';
import { BookingReadService } from './services/read/booking-read.service.js';
import { BookingSetupService } from './services/setup/booking-setup.service.js';
import { JwtBookingClientStrategy } from './strategies/jwt-booking-client.strategy.js';

@Module({
  imports: [
    PassportModule,
    LocationModule,
    CalendarModule,
    ClientsModule,
    StaffModule,
    PayrollModule,
    ServiceCatalogModule,
    OrdersModule,
    I18nModule,
  ],
  controllers: [BookingsController],
  providers: [
    BookingAccessService,
    BookingReservationService,
    BookingSelectionService,
    BookingSchedulingService,
    BookingSlotLockService,
    BookingEventsService,
    BookingWriteLockService,
    BookingLifecycleService,
    BookingRescheduleService,

    BookingsFacade,
    BookingCreateFacade,
    BookingClientTokenService,
    BookingCronService,
    BookingMutationService,
    BookingCalendarReadService,
    BookingReadService,
    BookingSetupService,
    BookingsExportService,
    PublicBookingRateLimiter,
    JwtBookingClientStrategy,
  ],
  exports: [
    BookingCalendarReadService,
    BookingCreateFacade,
    BookingsFacade,
    BookingAccessService,
  ],
})
export class BookingsModule {}
