import { Module } from '@nestjs/common';
import { ServiceCategoriesModule } from '../../services/categories/service-categories.module.js';
import { ServiceWriteModule } from '../../services/service-write/service-write.module.js';
import { StaffModule } from '../../staff/staff.module.js';
import { BrandModule } from '../brand.module.js';
import { BrandOnboardingService } from './services/brand-onboarding.service.js';

@Module({
  imports: [
    BrandModule,
    ServiceCategoriesModule,
    ServiceWriteModule,
    StaffModule,
  ],
  providers: [BrandOnboardingService],
  exports: [BrandOnboardingService],
})
export class BrandOnboardingModule {}
