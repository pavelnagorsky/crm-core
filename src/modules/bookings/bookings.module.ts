import { Module } from '@nestjs/common';
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
    BookingsAggregatesService,
    BookingsExportService,
    PublicBookingRateLimiter,
    JwtBookingClientStrategy,
  ],
  exports: [
    BookingsAggregatesService,
    CalendarBookingReader,
    BookingCreateService,
    BookingsService,
  ],
})
export class BookingsModule {}
