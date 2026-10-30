import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Request } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { Strategy } from 'passport-custom';
import { IGoogleCloudConfig } from '../../../config/interfaces/google-cloud-config.interface.js';
import { exceptionFactory } from '../../../shared/validation/exception-factory.js';
import { GoogleOauthRequestDto } from '../dto/google-oauth-request.dto.js';
import { OAuthResponseDto } from '../dto/oauth-response.dto.js';
import { GoogleOauthTypeEnum } from '../enums/google-oauth-type.enum.js';
import { OAuthProviderEnum } from '../enums/oauth-provider.enum.js';

@Injectable()
export class GoogleOAuthStrategy extends PassportStrategy(
  Strategy,
  'google-oauth',
) {
  private readonly client: OAuth2Client;

  constructor(private readonly config: ConfigService) {
    super();
    const cfg = config.get<IGoogleCloudConfig>('googleCloud');
    this.client = new OAuth2Client(cfg?.clientId, cfg?.clientSecret);
  }

  async validate(
    req: Request<Record<string, string>, unknown, unknown>,
  ): Promise<OAuthResponseDto> {
    if (!req.is('application/json')) {
      throw new BadRequestException(
        'Google sign-in requires a JSON request body',
      );
    }
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      throw new BadRequestException();
    }
    const dto = plainToInstance(GoogleOauthRequestDto, req.body);
    const errors = await validate(dto, { whitelist: true });
    if (errors.length) throw exceptionFactory(errors);

    const cfg = this.config.get<IGoogleCloudConfig>('googleCloud');
    if (
      !cfg?.clientId ||
      (dto.type === GoogleOauthTypeEnum.OAUTH && !cfg.clientSecret)
    ) {
      throw new UnauthorizedException('Google sign-in is not configured');
    }

    try {
      let idToken: string;
      if (dto.type === GoogleOauthTypeEnum.ONE_TAP) {
        idToken = dto.oneTapCode;
      } else {
        const { tokens } = await this.client.getToken({
          code: dto.authCode,
          redirect_uri: 'postmessage',
        });
        if (!tokens.id_token) throw new UnauthorizedException();
        idToken = tokens.id_token;
      }
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: cfg.clientId,
      });
      const payload = ticket.getPayload();
      if (!payload?.sub || !payload.email || payload.email_verified !== true)
        throw new UnauthorizedException('Verified Google email required');

      return new OAuthResponseDto({
        providerId: payload.sub,
        providerType: OAuthProviderEnum.Google,
        email: payload.email,
      });
    } catch {
      throw new UnauthorizedException('Google OAuth failed');
    }
  }
}
