import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { IJwtConfig, IFrontendConfig } from '../../config/configuration.js';
import { BookingClientTokenPayloadDto } from './dto/booking-client-token-payload.dto.js';

@Injectable()
export class BookingClientService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  generateClientLink(bookingId: string): string {
    const jwtCfg = this.config.get<IJwtConfig>('jwt')!;
    const frontendCfg = this.config.get<IFrontendConfig>('frontend')!;

    if (!jwtCfg.bookingClientTokenSecret || !jwtCfg.bookingClientTokenExpiration) {
      throw new Error('BOOKING_CLIENT_TOKEN_SECRET and BOOKING_CLIENT_TOKEN_EXPIRATION must be set');
    }

    const token = this.jwtService.sign(
      { bookingId } satisfies BookingClientTokenPayloadDto,
      {
        secret: jwtCfg.bookingClientTokenSecret,
        expiresIn: jwtCfg.bookingClientTokenExpiration as any,
      },
    );

    return `${frontendCfg.domain}/booking/manage?token=${token}`;
  }
}
