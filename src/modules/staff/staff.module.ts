import { Module } from '@nestjs/common';
import { StaffService } from './staff.service.js';
import { StaffCleanupService } from './services/staff-cleanup.service.js';
import { StaffExportService } from './services/staff-export.service.js';
import { StaffController } from './staff.controller.js';
import { StaffKpiController } from './kpi/staff-kpi.controller.js';
import { StaffKpiService } from './kpi/staff-kpi.service.js';
import { ServicesModule } from '../services/services.module.js';
import { I18nModule } from '../../shared/i18n/i18n.module.js';
import { LocationModule } from '../location/location.module.js';

@Module({
  imports: [ServicesModule, LocationModule, I18nModule],
  controllers: [StaffKpiController, StaffController],
  providers: [
    StaffService,
    StaffCleanupService,
    StaffKpiService,
    StaffExportService,
  ],
  exports: [StaffService],
})
export class StaffModule {}
