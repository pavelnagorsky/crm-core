import { Module } from '@nestjs/common';
import { AppCacheModule } from '../../../shared/cache/app-cache.module.js';
import { LocationModule } from '../../location/location.module.js';
import { ServiceCategoriesModule } from '../../services/categories/service-categories.module.js';
import { ServiceWriteModule } from '../../services/service-write/service-write.module.js';
import { StaffModule } from '../../staff/staff.module.js';
import { BrandInitialDataService } from './services/brand-initial-data.service.js';

@Module({
  imports: [
    AppCacheModule,
    LocationModule,
    ServiceCategoriesModule,
    ServiceWriteModule,
    StaffModule,
  ],
  providers: [BrandInitialDataService],
  exports: [BrandInitialDataService],
})
export class BrandOnboardingModule {}
