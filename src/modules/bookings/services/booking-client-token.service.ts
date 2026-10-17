import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { IJwtConfig } from '../../../config/interfaces/jwt-config.interface.js';
import { jwtExpirationConfig } from '../../../config/token-expiration.config.js';
import { BookingClientTokenPayloadDto } from '../dto/booking-client-token-payload.dto.js';

@Injectable()
export class BookingClientTokenService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  generateClientToken(bookingId: string): string {
    const jwtCfg = this.config.get<IJwtConfig>('jwt')!;

    if (!jwtCfg.bookingClientTokenSecret) {
      throw new Error('BOOKING_CLIENT_TOKEN_SECRET must be set');
    }

    return this.jwtService.sign(
      { bookingId } satisfies BookingClientTokenPayloadDto,
      {
        secret: jwtCfg.bookingClientTokenSecret,
        expiresIn: jwtExpirationConfig.bookingClientToken,
      },
    );
  }
}
