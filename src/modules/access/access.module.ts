import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { UserModule } from '../user/user.module.js';
import { PermissionCalculator } from './calculators/permission.calculator.js';
import { AccessAdministrationService } from './services/access-administration.service.js';
import { AccessInvitationTokenService } from './services/access-invitation-token.service.js';
import { AccessService } from './services/access.service.js';

@Module({
  imports: [AuditModule, UserModule],
  providers: [
    AccessService,
    PermissionCalculator,
    AccessAdministrationService,
    AccessInvitationTokenService,
  ],
  exports: [AccessService, AccessAdministrationService],
})
export class AccessModule {}
