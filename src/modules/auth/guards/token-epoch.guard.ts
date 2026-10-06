import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { AuthenticatedRequest } from '../interfaces/authenticated-request.interface.js';
import { TokenEpochRegistryService } from '../token-epoch-registry.service.js';

@Injectable()
export class TokenEpochGuard implements CanActivate {
  constructor(private readonly tokenEpochRegistry: TokenEpochRegistryService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const payload = request.user;

    if (!payload) throw new UnauthorizedException();

    const currentEpoch = await this.tokenEpochRegistry.get(payload.sub);
    if ((payload.tokenEpoch ?? 0) < currentEpoch) {
      throw new AppException(
        ErrorCode.TOKEN_PAYLOAD_STALE,
        HttpStatus.CONFLICT,
        {
          action: 'REFRESH_ACCESS_TOKEN',
          reason: 'TOKEN_EPOCH_CHANGED',
        },
      );
    }

    return true;
  }
}
