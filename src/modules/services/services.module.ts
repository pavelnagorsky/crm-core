import { Module } from '@nestjs/common';
import { BusinessModule } from '../business/business.module.js';
import { ServicesService } from './services.service.js';
import { ServicesController } from './services.controller.js';
import { ServiceBundleService } from './service-bundle.service.js';

@Module({
  imports: [BusinessModule],
  controllers: [ServicesController],
  providers: [ServicesService, ServiceBundleService],
  exports: [ServicesService],
})
export class ServicesModule {}
