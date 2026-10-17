import { Module } from '@nestjs/common';
import { I18nModule } from '../../shared/i18n/i18n.module.js';
import { AccessModule } from '../access/access.module.js';
import { LocationModule } from '../location/location.module.js';
import { ServicesModule } from '../services/services.module.js';
import { UserModule } from '../user/user.module.js';
import { StaffController } from './controllers/staff.controller.js';
import { StaffKpiController } from './kpi/controllers/staff-kpi.controller.js';
import { StaffKpiService } from './kpi/services/staff-kpi.service.js';
import { StaffExportService } from './services/staff-export.service.js';
import { StaffService } from './services/staff.service.js';

@Module({
  imports: [
    ServicesModule,
    LocationModule,
    I18nModule,
    AccessModule,
    UserModule,
  ],
  controllers: [StaffKpiController, StaffController],
  providers: [StaffService, StaffKpiService, StaffExportService],
  exports: [StaffService],
})
export class StaffModule {}
