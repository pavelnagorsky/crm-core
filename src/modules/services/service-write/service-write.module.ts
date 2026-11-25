import { Module } from '@nestjs/common';
import { AppCacheModule } from '../../../shared/cache/app-cache.module.js';
import { ServiceCategoriesModule } from '../categories/service-categories.module.js';
import { LocationModule } from '../../location/location.module.js';
import { ServiceWriteController } from './controllers/service-write.controller.js';
import { ServiceImportWriteService } from './services/service-import-write.service.js';
import { ServiceWriteService } from './services/service-write.service.js';

@Module({
  imports: [AppCacheModule, LocationModule, ServiceCategoriesModule],
  controllers: [ServiceWriteController],
  providers: [ServiceWriteService, ServiceImportWriteService],
  exports: [ServiceWriteService, ServiceImportWriteService],
})
export class ServiceWriteModule {}
