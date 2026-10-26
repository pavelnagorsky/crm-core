import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { IFrontendConfig } from '../../../config/interfaces/frontend-config.interface.js';
import { IJwtConfig } from '../../../config/interfaces/jwt-config.interface.js';
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
      { bookingId, jti: randomUUID() } satisfies BookingClientTokenPayloadDto,
      {
        secret: jwtCfg.bookingClientTokenSecret,
        algorithm: 'HS256',
      },
    );
  }

  managementUrl(token: string): string {
    const domain = this.config.get<IFrontendConfig>('frontend')!.domain;
    const url = new URL('/booking/manage', domain);
    url.hash = new URLSearchParams({ token }).toString();
    return url.toString();
  }
}
