import { Module } from '@nestjs/common';
import { AuditController } from './controllers/audit.controller.js';
import { AuditRenderer } from './rendering/audit.renderer.js';
import { AuditService } from './services/audit.service.js';

@Module({
  controllers: [AuditController],
  providers: [AuditService, AuditRenderer],
})
export class AuditModule {}
