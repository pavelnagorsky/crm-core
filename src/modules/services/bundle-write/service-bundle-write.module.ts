import { Module } from '@nestjs/common';
import { AppCacheModule } from '../../../shared/cache/app-cache.module.js';
import { LocationModule } from '../../location/location.module.js';
import { ServiceCatalogModule } from '../catalog/service-catalog.module.js';
import { ServiceBundleWriteController } from './controllers/service-bundle-write.controller.js';
import { ServiceBundleWriteService } from './services/service-bundle-write.service.js';

@Module({
  imports: [AppCacheModule, LocationModule, ServiceCatalogModule],
  controllers: [ServiceBundleWriteController],
  providers: [ServiceBundleWriteService],
})
export class ServiceBundleWriteModule {}
