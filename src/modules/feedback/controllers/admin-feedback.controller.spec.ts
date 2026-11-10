import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { PlatformAdminGuard } from '../../auth/guards/platform-admin.guard.js';
import { TokenEpochGuard } from '../../auth/guards/token-epoch.guard.js';
import { AdminFeedbackController } from './admin-feedback.controller.js';

describe('AdminFeedbackController', () => {
  it('authenticates and validates token epoch before checking the platform role', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminFeedbackController),
    ).toEqual([JwtAuthGuard, TokenEpochGuard, PlatformAdminGuard]);
  });
});
