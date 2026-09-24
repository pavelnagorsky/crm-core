import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { BookingsService } from './bookings.service.js';
import { BookingCreateService } from './booking-create.service.js';
import { BookingClientService } from './booking-client.service.js';
import { BookingCronService } from './booking-cron.service.js';
import { BookingsAggregatesService } from './bookings-aggregates.service.js';
import { BookingsController } from './bookings.controller.js';
import { JwtBookingClientStrategy } from './strategy/jwt-booking-client.strategy.js';
import { BusinessModule } from '../business/business.module.js';
import { CalendarModule } from '../calendar/calendar.module.js';
import { ClientsModule } from '../clients/clients.module.js';
import { StaffModule } from '../staff/staff.module.js';
import { PayrollModule } from '../payroll/payroll.module.js';

@Module({
  imports: [PassportModule, BusinessModule, CalendarModule, ClientsModule, StaffModule, PayrollModule],
  controllers: [BookingsController],
  providers: [BookingsService, BookingCreateService, BookingClientService, BookingCronService, BookingsAggregatesService, JwtBookingClientStrategy],
  exports: [BookingsAggregatesService],
})
export class BookingsModule {}
