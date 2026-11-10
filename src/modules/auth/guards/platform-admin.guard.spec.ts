import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PlatformAdminGuard } from './platform-admin.guard.js';

function context(role?: UserRole): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user: role ? { role } : undefined }),
    }),
  } as ExecutionContext;
}

describe('PlatformAdminGuard', () => {
  const guard = new PlatformAdminGuard();
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
