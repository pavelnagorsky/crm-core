import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { IJwtConfig } from '../../../config/configuration.js';
import { TokenPayloadDto } from '../dto/token-payload.dto.js';

@Injectable()
export class JwtEmailStrategy extends PassportStrategy(Strategy, 'email-jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromUrlQueryParameter('token'),
      ignoreExpiration: false,
      secretOrKey: config.get<IJwtConfig>('jwt')!.emailTokenSecret,
    });
  }

  validate(payload: TokenPayloadDto): TokenPayloadDto {
    return payload;
  }
}
