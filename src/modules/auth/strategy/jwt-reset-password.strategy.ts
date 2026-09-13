import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { IJwtConfig } from '../../../config/configuration.js';
import { TokenPayloadDto } from '../dto/token-payload.dto.js';

@Injectable()
export class JwtResetPasswordStrategy extends PassportStrategy(Strategy, 'reset-password-jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<IJwtConfig>('jwt')!.resetPasswordTokenSecret,
    });
  }

  validate(payload: TokenPayloadDto): TokenPayloadDto {
    return payload;
  }
}
