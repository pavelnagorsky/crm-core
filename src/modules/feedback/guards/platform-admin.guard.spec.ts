import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { TokenEpochGuard } from '../../auth/guards/token-epoch.guard.js';
import { AdminFeedbackController } from '../controllers/admin-feedback.controller.js';
import { PlatformAdminGuard } from './platform-admin.guard.js';

function context(role?: UserRole): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user: role ? { role } : undefined }),
    }),
  } as ExecutionContext;
}

describe('Feedback platform admin access', () => {
  const guard = new PlatformAdminGuard();
  it('authenticates and validates token epoch before checking the platform role', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminFeedbackController),
    ).toEqual([JwtAuthGuard, TokenEpochGuard, PlatformAdminGuard]);
  });
  it('rejects unauthenticated users', () => {
    expect(() => guard.canActivate(context())).toThrow(UnauthorizedException);
  });
  it('rejects ordinary users regardless of business permissions', () => {
    expect(() => guard.canActivate(context(UserRole.USER))).toThrow(
      ForbiddenException,
    );
  });
  it('allows platform admins', () => {
    expect(guard.canActivate(context(UserRole.ADMIN))).toBe(true);
  });
});
