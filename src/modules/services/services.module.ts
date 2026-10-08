import { Module } from '@nestjs/common';
import { LocationModule } from '../location/location.module.js';
import { ServicesService } from './services.service.js';
import { ServicesController } from './services.controller.js';
import { ServiceBundleService } from './catalog/service-bundle.service.js';
import { ServiceCatalogService } from './catalog/service-catalog.service.js';

@Module({
  imports: [LocationModule],
  controllers: [ServicesController],
  providers: [ServicesService, ServiceBundleService, ServiceCatalogService],
  exports: [ServicesService, ServiceBundleService, ServiceCatalogService],
})
export class ServicesModule {}
