import { Module } from '@nestjs/common';
import { LocationModule } from '../location/location.module.js';
import { ServiceBundleService } from './catalog/service-bundle.service.js';
import { ServiceCatalogFacade } from './catalog/service-catalog.facade.js';
import { ServicesController } from './controllers/services.controller.js';
import { ServicesService } from './services.service.js';

@Module({
  imports: [LocationModule],
  controllers: [ServicesController],
  providers: [ServicesService, ServiceBundleService, ServiceCatalogFacade],
  exports: [ServicesService, ServiceBundleService, ServiceCatalogFacade],
})
export class ServicesModule {}
