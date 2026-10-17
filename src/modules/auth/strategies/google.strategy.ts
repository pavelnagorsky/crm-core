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
import { GoogleOauthRequestDto } from '../dto/google-oauth-request.dto.js';
import { OAuthResponseDto } from '../dto/oauth-response.dto.js';
import { OAuthProviderEnum } from '../enums/oauth-provider.enum.js';

@Injectable()
export class GoogleOAuthStrategy extends PassportStrategy(
  Strategy,
  'google-oauth',
) {
  private readonly client: OAuth2Client;

  constructor(private readonly config: ConfigService) {
    super();
    const cfg = config.get<IGoogleCloudConfig>('googleCloud')!;
    this.client = new OAuth2Client(cfg.clientId, cfg.clientSecret);
  }

  async validate(
    req: Request<Record<string, string>, unknown, unknown>,
  ): Promise<OAuthResponseDto> {
    try {
      const dto = plainToInstance(GoogleOauthRequestDto, req.body);
      const errors = await validate(dto);
      if (errors.length) throw new BadRequestException();

      const cfg = this.config.get<IGoogleCloudConfig>('googleCloud')!;
      const { tokens } = await this.client.getToken({
        code: dto.authCode,
        redirect_uri: 'postmessage',
      });
      const ticket = await this.client.verifyIdToken({
        idToken: tokens.id_token!,
        audience: cfg.clientId,
      });
      const payload = ticket.getPayload();
      if (!payload?.email || payload.email_verified !== true)
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
