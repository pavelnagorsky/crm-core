import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { TokenPayloadDto } from '../dto/token-payload.dto.js';

export const TokenPayload = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TokenPayloadDto => {
    const request = ctx.switchToHttp().getRequest();
    if (!request.user) throw new UnauthorizedException();
    return request.user as TokenPayloadDto;
  },
);
