import { Module } from '@nestjs/common';
import { BusinessService } from './business.service.js';
import { BusinessController } from './business.controller.js';
import { UserModule } from '../user/user.module.js';

@Module({
  imports: [UserModule],
  controllers: [BusinessController],
  providers: [BusinessService],
  exports: [BusinessService],
})
export class BusinessModule {}
