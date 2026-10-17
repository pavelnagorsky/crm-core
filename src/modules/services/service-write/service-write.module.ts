import { Module } from '@nestjs/common';
import { LocationModule } from '../../location/location.module.js';
import { ServiceWriteController } from './controllers/service-write.controller.js';
import { ServiceWriteService } from './services/service-write.service.js';

@Module({
  imports: [LocationModule],
  controllers: [ServiceWriteController],
  providers: [ServiceWriteService],
})
export class ServiceWriteModule {}
