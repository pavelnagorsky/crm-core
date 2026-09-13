import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { OAuthResponseDto } from '../dto/oauth-response.dto.js';

export const OAuthData = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): OAuthResponseDto => {
    const request = ctx.switchToHttp().getRequest();
    if (!request.user) throw new UnauthorizedException();
    return request.user as OAuthResponseDto;
  },
);
