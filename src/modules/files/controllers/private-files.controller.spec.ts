import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { TokenEpochGuard } from '../../auth/guards/token-epoch.guard.js';
import { PrivateFilesController } from './private-files.controller.js';

describe('PrivateFilesController access', () => {
  it('requires a signed-in user to upload or delete private files', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, PrivateFilesController),
    ).toEqual([JwtAuthGuard, TokenEpochGuard]);
  });
});
