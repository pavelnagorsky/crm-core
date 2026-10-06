import { Module } from '@nestjs/common';
import { BusinessService } from './business.service.js';
import { UserModule } from '../user/user.module.js';

@Module({
  imports: [UserModule],
  providers: [BusinessService],
  exports: [BusinessService],
})
export class BusinessModule {}
