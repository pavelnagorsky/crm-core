import { Module } from '@nestjs/common';
import { AuditService } from './audit.service.js';
import { AuditController } from './audit.controller.js';
import { AuditRendererService } from './renderer/audit-renderer.service.js';

@Module({
  controllers: [AuditController],
  providers: [AuditService, AuditRendererService],
})
export class AuditModule {}
