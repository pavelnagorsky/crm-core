import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module.js';
import { UserModule } from '../user/user.module.js';
import { AdminSupportController } from './controllers/admin-support.controller.js';
import { PublicSupportController } from './controllers/public-support.controller.js';
import { SupportAttachmentsController } from './controllers/support-attachments.controller.js';
import { SupportAttachmentCleanupService } from './services/support-attachment-cleanup.service.js';
import { SupportService } from './services/support.service.js';

@Module({
  imports: [FilesModule, UserModule],
  controllers: [
    PublicSupportController,
    SupportAttachmentsController,
    AdminSupportController,
  ],
  providers: [SupportService, SupportAttachmentCleanupService],
})
export class SupportModule {}
