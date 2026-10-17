import { Module } from '@nestjs/common';
import { ServiceCategoriesModule } from '../categories/service-categories.module.js';
import { ServiceCatalogController } from './controllers/service-catalog.controller.js';
import { ServiceCatalogItemFactory } from './factories/service-catalog-item.factory.js';
import { ServiceCatalogFacade } from './service-catalog.facade.js';
import { ServiceBundleReadService } from './services/service-bundle-read.service.js';
import { ServiceCatalogReadService } from './services/service-catalog-read.service.js';
import { ServiceReadService } from './services/service-read.service.js';

@Module({
  imports: [ServiceCategoriesModule],
  controllers: [ServiceCatalogController],
  providers: [
    ServiceCatalogFacade,
    ServiceCatalogReadService,
    ServiceReadService,
    ServiceBundleReadService,
    ServiceCatalogItemFactory,
  ],
  exports: [ServiceCatalogFacade],
})
export class ServiceCatalogModule {}
