import { Module } from '@nestjs/common';
import { StaffService } from './staff.service.js';
import { StaffCleanupService } from './staff-cleanup.service.js';
import { StaffController } from './staff.controller.js';
import { BusinessModule } from '../business/business.module.js';

@Module({
  imports: [BusinessModule],
  controllers: [StaffController],
  providers: [StaffService, StaffCleanupService],
  exports: [StaffService],
})
export class StaffModule {}
