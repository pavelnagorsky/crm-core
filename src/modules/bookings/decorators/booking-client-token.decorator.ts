import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { BookingClientTokenPayloadDto } from '../dto/booking-client-token-payload.dto.js';

export const BookingClientToken = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): BookingClientTokenPayloadDto => {
    const request = ctx.switchToHttp().getRequest();
    if (!request.user) throw new UnauthorizedException();
    return request.user as BookingClientTokenPayloadDto;
  },
);
