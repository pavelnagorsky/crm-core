import { Module } from '@nestjs/common';
import { StaffKpiService } from './staff-kpi.service.js';
import { StaffKpiController } from './staff-kpi.controller.js';
import { StaffModule } from '../staff.module.js';
import { ServicesModule } from '../../services/services.module.js';

@Module({
  imports: [StaffModule, ServicesModule],
  controllers: [StaffKpiController],
  providers: [StaffKpiService],
})
export class StaffKpiModule {}
