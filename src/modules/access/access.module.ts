import { Module } from '@nestjs/common';
import { AccessService } from './access.service.js';
import { AccessAdministrationService } from './services/access-administration.service.js';
import { PermissionComputeService } from './services/permission-compute.service.js';

@Module({
  providers: [
    AccessService,
    PermissionComputeService,
    AccessAdministrationService,
  ],
  exports: [AccessService, AccessAdministrationService],
})
export class AccessModule {}
