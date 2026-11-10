import { Module } from '@nestjs/common';
import { AdminFeedbackController } from './controllers/admin-feedback.controller.js';
import { PublicFeedbackController } from './controllers/public-feedback.controller.js';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard.js';
import { FeedbackService } from './services/feedback.service.js';

@Module({
  controllers: [PublicFeedbackController, AdminFeedbackController],
  providers: [FeedbackService, PlatformAdminGuard],
})
export class FeedbackModule {}
