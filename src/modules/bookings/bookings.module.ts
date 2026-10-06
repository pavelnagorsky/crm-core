import { forwardRef, Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { BookingsService } from './bookings.service.js';
import { BookingCreateService } from './booking-create.service.js';
import { BookingClientService } from './booking-client.service.js';
import { BookingCronService } from './booking-cron.service.js';
import { BookingsAggregatesService } from './bookings-aggregates.service.js';
import { BookingsController } from './bookings.controller.js';
import { BookingsExportService } from './bookings-export/bookings-export.service.js';
import { PublicBookingRateLimiter } from './public-booking-rate-limiter.js';
import { I18nModule } from '../../shared/i18n/i18n.module.js';
import { JwtBookingClientStrategy } from './strategy/jwt-booking-client.strategy.js';
import { CalendarBookingReader } from '../calendar/calendar-booking-reader.js';
import { BusinessModule } from '../business/business.module.js';
import { CalendarModule } from '../calendar/calendar.module.js';
import { ClientsModule } from '../clients/clients.module.js';
import { StaffModule } from '../staff/staff.module.js';
import { PayrollModule } from '../payroll/payroll.module.js';
import { BookingChannelsModule } from '../booking-channels/booking-channels.module.js';

@Module({
  // Booking create and reschedule use CalendarService; the calendar view reads bookings back.
  // Public booking creation attributes the row to a page or widget owned by BookingChannelsModule.
  imports: [
    PassportModule,
    BusinessModule,
    forwardRef(() => CalendarModule),
    ClientsModule,
    StaffModule,
    PayrollModule,
    I18nModule,
    forwardRef(() => BookingChannelsModule),
  ],
  controllers: [BookingsController],
  providers: [
    BookingsService,
    { provide: CalendarBookingReader, useExisting: BookingsService },
    BookingCreateService,
    BookingClientService,
    BookingCronService,
    BookingsAggregatesService,
    BookingsExportService,
    PublicBookingRateLimiter,
    JwtBookingClientStrategy,
  ],
  exports: [BookingsAggregatesService, CalendarBookingReader, BookingsService],
})
export class BookingsModule {}
