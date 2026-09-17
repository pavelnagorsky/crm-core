import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { BOOKING_CLIENT_JWT_STRATEGY } from '../strategy/jwt-booking-client.strategy.js';

@Injectable()
export class JwtBookingClientGuard extends AuthGuard(BOOKING_CLIENT_JWT_STRATEGY) {}
