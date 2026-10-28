import { Module } from '@nestjs/common';
import { AppCacheModule } from '../../../shared/cache/app-cache.module.js';
import { ServiceCategoriesController } from './controllers/service-categories.controller.js';
import { ServiceCategoriesService } from './services/service-categories.service.js';

@Module({
  imports: [AppCacheModule],
  controllers: [ServiceCategoriesController],
  providers: [ServiceCategoriesService],
  exports: [ServiceCategoriesService],
})
export class ServiceCategoriesModule {}
