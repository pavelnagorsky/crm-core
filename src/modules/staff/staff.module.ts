import { Module } from '@nestjs/common';
import { I18nModule } from '../../shared/i18n/i18n.module.js';
import { AccessModule } from '../access/access.module.js';
import { LocationModule } from '../location/location.module.js';
import { ServiceCatalogModule } from '../services/catalog/service-catalog.module.js';
import { UserModule } from '../user/user.module.js';
import { StaffController } from './controllers/staff.controller.js';
import { StaffAnalyticsController } from './analytics/controllers/staff-analytics.controller.js';
import { StaffAnalyticsService } from './analytics/services/staff-analytics.service.js';
import { StaffExportService } from './export/services/staff-export.service.js';
import { StaffService } from './services/staff.service.js';
import { StaffAccessService } from './services/staff-access.service.js';

@Module({
  imports: [
    ServiceCatalogModule,
    LocationModule,
    I18nModule,
    AccessModule,
    UserModule,
  ],
  controllers: [StaffAnalyticsController, StaffController],
  providers: [
    StaffService,
    StaffAccessService,
    StaffAnalyticsService,
    StaffExportService,
  ],
  exports: [StaffService, StaffAccessService],
})
export class StaffModule {}
