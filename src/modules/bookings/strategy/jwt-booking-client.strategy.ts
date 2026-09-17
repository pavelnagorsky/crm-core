import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { IJwtConfig } from '../../../config/configuration.js';
import { BookingClientTokenPayloadDto } from '../dto/booking-client-token-payload.dto.js';

export const BOOKING_CLIENT_JWT_STRATEGY = 'booking-client-jwt';

@Injectable()
export class JwtBookingClientStrategy extends PassportStrategy(Strategy, BOOKING_CLIENT_JWT_STRATEGY) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<IJwtConfig>('jwt')!.bookingClientTokenSecret,
    });
  }

  validate(payload: BookingClientTokenPayloadDto): BookingClientTokenPayloadDto {
    return payload;
  }
}
