import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { BrandModule } from '../brand/brand.module.js';
import { LocationModule } from '../location/location.module.js';
import { StaffModule } from '../staff/staff.module.js';
import { UserModule } from '../user/user.module.js';
import { AccessManagementController } from './access-management.controller.js';
import { AccessManagementService } from './access-management.service.js';
import { LegacyStaffInvitationsController } from './legacy-staff-invitations.controller.js';
import { InvitationRateLimiter } from './services/invitation-rate-limiter.js';

@Module({
  imports: [
    AccessModule,
    AuthModule,
    StaffModule,
    BrandModule,
    LocationModule,
    UserModule,
  ],
  providers: [AccessManagementService, InvitationRateLimiter],
  controllers: [AccessManagementController, LegacyStaffInvitationsController],
})
export class AccessManagementModule {}
