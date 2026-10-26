import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { BookingWithItems } from '../interfaces/booking-with-items.interface.js';

export const ClientBooking = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): BookingWithItems => {
    const booking = ctx.switchToHttp().getRequest().user;
    if (!booking) throw new UnauthorizedException();
    return booking as BookingWithItems;
  },
);
