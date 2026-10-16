import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { IJwtConfig } from '../../../config/configuration.js';
import { TokenPayloadDto } from '../dto/token-payload.dto.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(
  Strategy,
  'access-jwt',
) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<IJwtConfig>('jwt')!.accessTokenSecret,
    });
  }

  validate(payload: TokenPayloadDto): TokenPayloadDto {
    if (!payload.permissions)
      throw new AppException(
        ErrorCode.TOKEN_PAYLOAD_STALE,
        HttpStatus.CONFLICT,
        { action: 'REFRESH_ACCESS_TOKEN', reason: 'PERMISSIONS_MISSING' },
      );
    return payload;
  }
}
