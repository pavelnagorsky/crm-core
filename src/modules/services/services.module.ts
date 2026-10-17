import { Module } from '@nestjs/common';
import { LocationModule } from '../location/location.module.js';
import { ServiceBundleService } from './catalog/service-bundle.service.js';
import { ServiceCatalogReadService } from './catalog/service-catalog-read.service.js';
import { ServiceCatalogFacade } from './catalog/service-catalog.facade.js';
import { ServicesController } from './controllers/services.controller.js';
import { ServiceCatalogItemFactory } from './factories/service-catalog-item.factory.js';
import { ServicesService } from './services.service.js';

@Module({
  imports: [LocationModule],
  controllers: [ServicesController],
  providers: [
    ServicesService,
    ServiceBundleService,
    ServiceCatalogFacade,
    ServiceCatalogReadService,
    ServiceCatalogItemFactory,
  ],
  exports: [ServicesService, ServiceBundleService, ServiceCatalogFacade],
})
export class ServicesModule {}
