import { Module } from '@nestjs/common';
import { CalendarService } from './calendar.service.js';
import { CalendarComputeService } from './calendar-compute.service.js';
import { LocationModule } from '../location/location.module.js';
import { StaffModule } from '../staff/staff.module.js';
import { ServicesModule } from '../services/services.module.js';

@Module({
  imports: [LocationModule, StaffModule, ServicesModule],
  providers: [CalendarService, CalendarComputeService],
  exports: [CalendarService],
})
export class CalendarModule {}
