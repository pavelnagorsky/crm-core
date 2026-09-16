import { Module } from '@nestjs/common';
import { CalendarService } from './calendar.service.js';
import { CalendarComputeService } from './calendar-compute.service.js';
import { CalendarController } from './calendar.controller.js';
import { BusinessModule } from '../business/business.module.js';
import { StaffModule } from '../staff/staff.module.js';

@Module({
  imports: [BusinessModule, StaffModule],
  controllers: [CalendarController],
  providers: [CalendarService, CalendarComputeService],
  exports: [CalendarService],
})
export class CalendarModule {}
