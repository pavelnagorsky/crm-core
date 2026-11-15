import { Module } from '@nestjs/common';
import { LocationModule } from '../../location/location.module.js';
import { StaffModule } from '../../staff/staff.module.js';
import { BillingCoreModule } from '../billing-core.module.js';
import { BillingUsageService } from './services/billing-usage.service.js';

@Module({
  imports: [BillingCoreModule, StaffModule, LocationModule],
  providers: [BillingUsageService],
  exports: [BillingUsageService],
})
export class BillingUsageModule {}
