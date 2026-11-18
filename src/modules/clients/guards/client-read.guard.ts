import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthenticatedRequest } from '../../auth/interfaces/authenticated-request.interface.js';
import { canReadBrandClients } from '../rules/client-read-access.rules.js';

@Injectable()
export class ClientReadGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user) throw new UnauthorizedException();
    const brandId = request.params.brandId;
    if (!brandId || !canReadBrandClients(request.user, brandId))
      throw new ForbiddenException('Access denied');
    return true;
  }
}
