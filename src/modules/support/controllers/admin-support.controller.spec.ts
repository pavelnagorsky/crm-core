import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { OptionalJwtAuthGuard } from '../../auth/guards/optional-jwt-auth.guard.js';
import { PlatformAdminGuard } from '../../auth/guards/platform-admin.guard.js';
import { TokenEpochGuard } from '../../auth/guards/token-epoch.guard.js';
import { AdminSupportController } from './admin-support.controller.js';
import { PublicSupportController } from './public-support.controller.js';
import { SupportAttachmentsController } from './support-attachments.controller.js';

describe('Support controllers access', () => {
  it('authenticates and validates token epoch before checking the platform role', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminSupportController),
    ).toEqual([JwtAuthGuard, TokenEpochGuard, PlatformAdminGuard]);
  });

  it('accepts guests and signed-in users on the public endpoint', () => {
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        PublicSupportController.prototype.create,
      ),
    ).toEqual([OptionalJwtAuthGuard]);
  });

  it('requires a signed-in user to upload or remove attachments', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, SupportAttachmentsController),
    ).toEqual([JwtAuthGuard, TokenEpochGuard]);
  });
});
