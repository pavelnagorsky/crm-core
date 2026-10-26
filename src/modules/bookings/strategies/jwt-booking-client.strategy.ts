import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { IJwtConfig } from '../../../config/interfaces/jwt-config.interface.js';
import { BookingClientTokenPayloadDto } from '../dto/booking-client-token-payload.dto.js';
import { clientAccessExpiresAt } from '../rules/booking-client.rules.js';
import { BookingReadService } from '../services/read/booking-read.service.js';
import { BookingWithItems } from '../interfaces/booking-with-items.interface.js';

export const BOOKING_CLIENT_JWT_STRATEGY = 'booking-client-jwt';

@Injectable()
export class JwtBookingClientStrategy extends PassportStrategy(
  Strategy,
  BOOKING_CLIENT_JWT_STRATEGY,
) {
  constructor(
    config: ConfigService,
    private readonly bookings: BookingReadService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<IJwtConfig>('jwt')!.bookingClientTokenSecret,
      algorithms: ['HS256'],
    });
  }

  async validate(
    payload: BookingClientTokenPayloadDto,
  ): Promise<BookingWithItems> {
    if (
      !payload ||
      typeof payload.bookingId !== 'string' ||
      !isUUID(payload.bookingId)
    )
      throw new UnauthorizedException('Invalid booking token');
    try {
      const booking = await this.bookings.findById(payload.bookingId);
      // The deadline follows the current visit, so rescheduling keeps existing links usable.
      if (clientAccessExpiresAt(booking).getTime() <= Date.now())
        throw new UnauthorizedException('Booking link has expired');
      return booking;
    } catch (error) {
      if (error instanceof NotFoundException)
        throw new UnauthorizedException('Booking link is unavailable');
      throw error;
    }
  }
}
