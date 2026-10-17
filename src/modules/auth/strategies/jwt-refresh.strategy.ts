import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { IJwtConfig } from '../../../config/interfaces/jwt-config.interface.js';
import { TokenPayloadDto } from '../dto/token-payload.dto.js';
import { CookiesEnum } from '../enums/cookies.enum.js';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'refresh-jwt',
) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => req?.cookies?.[CookiesEnum.REFRESH_TOKEN] ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<IJwtConfig>('jwt')!.refreshTokenSecret,
      passReqToCallback: true,
    });
  }

  validate(
    req: Request,
    payload: TokenPayloadDto,
  ): TokenPayloadDto & { refreshToken: string } {
    const refreshToken = req.cookies?.[CookiesEnum.REFRESH_TOKEN];
    if (!refreshToken) throw new UnauthorizedException();
    return Object.assign(payload, { refreshToken });
  }
}
