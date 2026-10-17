import { Module } from '@nestjs/common';
import { ServiceCategoriesController } from './controllers/service-categories.controller.js';
import { ServiceCategoriesService } from './services/service-categories.service.js';

@Module({
  controllers: [ServiceCategoriesController],
  providers: [ServiceCategoriesService],
  exports: [ServiceCategoriesService],
})
export class ServiceCategoriesModule {}
