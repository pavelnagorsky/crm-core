import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { BrandModule } from '../brand/brand.module.js';
import { LocationModule } from '../location/location.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { StaffModule } from '../staff/staff.module.js';
import { UserModule } from '../user/user.module.js';
import { AccessManagementFacade } from './access-management.facade.js';
import { AccessManagementController } from './controllers/access-management.controller.js';
import { InvitationRateLimiter } from './services/invitation-rate-limiter.js';

@Module({
  imports: [
    AccessModule,
    AuthModule,
    StaffModule,
    BrandModule,
    LocationModule,
    UserModule,
    NotificationsModule,
  ],
  providers: [AccessManagementFacade, InvitationRateLimiter],
  controllers: [AccessManagementController],
})
export class AccessManagementModule {}
