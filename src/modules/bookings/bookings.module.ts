import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { BookingsService } from './bookings.service.js';
import { BookingCreateService } from './services/booking-create.service.js';
import { BookingClientService } from './services/booking-client.service.js';
import { BookingCronService } from './services/booking-cron.service.js';
import { BookingsController } from './bookings.controller.js';
import { BookingsExportService } from './bookings-export/bookings-export.service.js';
import { PublicBookingRateLimiter } from './services/public-booking-rate-limiter.js';
import { BookingMutationService } from './services/mutation/booking-mutation.service.js';
import { BookingReadService } from './services/read/booking-read.service.js';
import { BookingSetupService } from './services/setup/booking-setup.service.js';
import { I18nModule } from '../../shared/i18n/i18n.module.js';
import { JwtBookingClientStrategy } from './strategies/jwt-booking-client.strategy.js';
import { CalendarBookingReader } from '../calendar/tokens/calendar-booking-reader.js';
import { LocationModule } from '../location/location.module.js';
import { CalendarModule } from '../calendar/calendar.module.js';
import { ClientsModule } from '../clients/clients.module.js';
import { StaffModule } from '../staff/staff.module.js';
import { PayrollModule } from '../payroll/payroll.module.js';
import { ServicesModule } from '../services/services.module.js';
import { OrdersModule } from '../orders/orders.module.js';

@Module({
  imports: [
    PassportModule,
    LocationModule,
    CalendarModule,
    ClientsModule,
    StaffModule,
    PayrollModule,
    ServicesModule,
    OrdersModule,
    I18nModule,
  ],
  controllers: [BookingsController],
  providers: [
    BookingsService,
    { provide: CalendarBookingReader, useExisting: BookingsService },
    BookingCreateService,
    BookingClientService,
    BookingCronService,
    BookingMutationService,
    BookingReadService,
    BookingSetupService,
    BookingsExportService,
    PublicBookingRateLimiter,
    JwtBookingClientStrategy,
  ],
  exports: [
    CalendarBookingReader,
    BookingCreateService,
    BookingsService,
  ],
})
export class BookingsModule {}
