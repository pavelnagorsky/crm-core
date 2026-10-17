import { Module } from '@nestjs/common';
import { PermissionCalculator } from './calculators/permission.calculator.js';
import { AccessAdministrationService } from './services/access-administration.service.js';
import { AccessService } from './services/access.service.js';

@Module({
  providers: [AccessService, PermissionCalculator, AccessAdministrationService],
  exports: [AccessService, AccessAdministrationService],
})
export class AccessModule {}
