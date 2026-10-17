import { Module } from '@nestjs/common';
import { LocationModule } from '../location/location.module.js';
import { ServicesModule } from '../services/services.module.js';
import { StaffModule } from '../staff/staff.module.js';
import { CalendarCalculator } from './calculators/calendar.calculator.js';
import { CalendarFacade } from './calendar.facade.js';
import { CalendarAvailabilityService } from './services/availability/calendar-availability.service.js';
import { BookingCalendarEventService } from './services/events/booking-calendar-event.service.js';
import { CalendarEventService } from './services/events/calendar-event.service.js';
import { CalendarViewBuilderService } from './services/view/calendar-view-builder.service.js';

@Module({
  imports: [LocationModule, StaffModule, ServicesModule],
  providers: [
    CalendarFacade,
    CalendarCalculator,
    CalendarAvailabilityService,
    BookingCalendarEventService,
    CalendarEventService,
    CalendarViewBuilderService,
  ],
  exports: [CalendarFacade],
})
export class CalendarModule {}
