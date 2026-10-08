import { Module } from '@nestjs/common';
import { CalendarService } from './calendar.service.js';
import { CalendarComputeService } from './services/calendar-compute.service.js';
import { CalendarAvailabilityService } from './services/availability/calendar-availability.service.js';
import { BookingCalendarEventService } from './services/events/booking-calendar-event.service.js';
import { CalendarEventService } from './services/events/calendar-event.service.js';
import { CalendarViewBuilderService } from './services/view/calendar-view-builder.service.js';
import { LocationModule } from '../location/location.module.js';
import { StaffModule } from '../staff/staff.module.js';
import { ServicesModule } from '../services/services.module.js';

@Module({
  imports: [LocationModule, StaffModule, ServicesModule],
  providers: [
    CalendarService,
    CalendarComputeService,
    CalendarAvailabilityService,
    BookingCalendarEventService,
    CalendarEventService,
    CalendarViewBuilderService,
  ],
  exports: [CalendarService],
})
export class CalendarModule {}
