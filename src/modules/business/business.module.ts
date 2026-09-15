import { Module } from '@nestjs/common';
import { BusinessService } from './business.service.js';
import { BusinessController } from './business.controller.js';
import { UserModule } from '../user/user.module.js';
import { RbacGuard } from './guards/rbac.guard.js';

@Module({
  imports: [UserModule],
  controllers: [BusinessController],
  providers: [BusinessService, RbacGuard],
  exports: [BusinessService, RbacGuard],
})
export class BusinessModule {}
