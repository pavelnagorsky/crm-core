import { Module } from '@nestjs/common';
import { BookingsModule } from '../../bookings/bookings.module.js';
import { LocationModule } from '../../location/location.module.js';
import { CalendarModule } from '../calendar.module.js';
import { CalendarViewFacade } from './calendar-view.facade.js';
import { CalendarController } from './controllers/calendar.controller.js';

@Module({
  imports: [CalendarModule, BookingsModule, LocationModule],
  controllers: [CalendarController],
  providers: [CalendarViewFacade],
})
export class CalendarApiModule {}
