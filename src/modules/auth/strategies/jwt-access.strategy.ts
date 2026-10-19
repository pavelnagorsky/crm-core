import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { UserRole } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PERMISSIONS_VERSION } from '../../access/constants/permissions-version.js';
import { IJwtConfig } from '../../../config/interfaces/jwt-config.interface.js';
import { AppException } from '../../../shared/exceptions/app.exception.js';
import { ErrorCode } from '../../../shared/validation/error-codes.enum.js';
import { hasGlobalPermission } from '../../access/utils/has-global-permission.js';
import { TokenPayloadDto } from '../dto/token-payload.dto.js';

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
    if (
      payload.role === UserRole.ADMIN &&
      !hasGlobalPermission(payload.permissions)
    )
      throw new AppException(
        ErrorCode.TOKEN_PAYLOAD_STALE,
        HttpStatus.CONFLICT,
        { action: 'REFRESH_ACCESS_TOKEN', reason: 'GLOBAL_PERMISSION_MISSING' },
      );
    if (payload.permissionsVersion !== PERMISSIONS_VERSION)
      throw new AppException(
        ErrorCode.TOKEN_PAYLOAD_STALE,
        HttpStatus.CONFLICT,
        {
          action: 'REFRESH_ACCESS_TOKEN',
          reason: 'PERMISSIONS_FORMAT_CHANGED',
        },
      );
    return payload;
  }
}
