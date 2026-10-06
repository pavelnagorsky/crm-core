import { forwardRef, Module } from '@nestjs/common';
import { CalendarService } from './calendar.service.js';
import { CalendarComputeService } from './calendar-compute.service.js';
import { CalendarController } from './calendar.controller.js';
import { LocationModule } from '../location/location.module.js';
import { BookingsModule } from '../bookings/bookings.module.js';
import { StaffModule } from '../staff/staff.module.js';

@Module({
  // Calendar view reads bookings; booking create and reschedule call back into CalendarService.
  imports: [LocationModule, StaffModule, forwardRef(() => BookingsModule)],
  controllers: [CalendarController],
  providers: [CalendarService, CalendarComputeService],
  exports: [CalendarService],
})
export class CalendarModule {}
