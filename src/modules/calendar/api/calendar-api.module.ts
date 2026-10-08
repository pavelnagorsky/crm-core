import { Module } from '@nestjs/common';
import { BookingsModule } from '../../bookings/bookings.module.js';
import { LocationModule } from '../../location/location.module.js';
import { CalendarModule } from '../calendar.module.js';
import { CalendarController } from './calendar.controller.js';
import { CalendarViewService } from './calendar-view.service.js';

@Module({
  imports: [CalendarModule, BookingsModule, LocationModule],
  controllers: [CalendarController],
  providers: [CalendarViewService],
})
export class CalendarApiModule {}
