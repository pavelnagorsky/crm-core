import { Module } from '@nestjs/common';
import { ServicesAnalyticsModule } from './analytics/services-analytics.module.js';
import { ServiceBundleWriteModule } from './bundle-write/service-bundle-write.module.js';
import { ServiceCatalogModule } from './catalog/service-catalog.module.js';
import { ServiceWriteModule } from './service-write/service-write.module.js';

@Module({
  imports: [
    ServiceCatalogModule,
    ServiceWriteModule,
    ServiceBundleWriteModule,
    ServicesAnalyticsModule,
  ],
})
export class ServicesModule {}
