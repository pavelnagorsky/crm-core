import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TokenPayloadDto } from '../dto/token-payload.dto.js';

export const OptionalTokenPayload = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TokenPayloadDto | null =>
    (ctx.switchToHttp().getRequest().user as TokenPayloadDto | undefined) ??
    null,
);
