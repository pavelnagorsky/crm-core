import { Module } from '@nestjs/common';
import { BookingsService } from './bookings.service.js';
import { BookingCreateService } from './booking-create.service.js';
import { BookingsController } from './bookings.controller.js';
import { BusinessModule } from '../business/business.module.js';
import { CalendarModule } from '../calendar/calendar.module.js';
import { ClientsModule } from '../clients/clients.module.js';
import { StaffModule } from '../staff/staff.module.js';

@Module({
  imports: [BusinessModule, CalendarModule, ClientsModule, StaffModule],
  controllers: [BookingsController],
  providers: [BookingsService, BookingCreateService],
})
export class BookingsModule {}
