import { Module } from '@nestjs/common';
import { StaffService } from './staff.service.js';
import { StaffCleanupService } from './staff-cleanup.service.js';
import { StaffExportService } from './staff-export.service.js';
import { StaffController } from './staff.controller.js';
import { StaffKpiController } from './kpi/staff-kpi.controller.js';
import { StaffKpiService } from './kpi/staff-kpi.service.js';
import { BusinessModule } from '../business/business.module.js';
import { ServicesModule } from '../services/services.module.js';
import { I18nModule } from '../../shared/i18n/i18n.module.js';

@Module({
  imports: [BusinessModule, ServicesModule, I18nModule],
  controllers: [StaffKpiController, StaffController],
  providers: [StaffService, StaffCleanupService, StaffKpiService, StaffExportService],
  exports: [StaffService],
})
export class StaffModule {}
