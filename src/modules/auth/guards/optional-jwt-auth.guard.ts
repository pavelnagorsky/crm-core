import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { TokenEpochGuard } from './token-epoch.guard.js';

/**
 * Lets anonymous requests through without `request.user`. When an
 * Authorization header is present the token is validated exactly like `@Auth()`
 * (signature, expiry, token epoch) — an invalid token is rejected instead of
 * silently treating the caller as a guest.
 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  private readonly jwtAuthGuard = new JwtAuthGuard();

  constructor(private readonly tokenEpochGuard: TokenEpochGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined> }>();
    if (!request.headers.authorization) return true;
    await this.jwtAuthGuard.canActivate(context);
    return this.tokenEpochGuard.canActivate(context);
  }
}
