import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Strategy } from 'passport-custom';
import { OAuth2Client } from 'google-auth-library';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { IGoogleCloudConfig } from '../../../config/configuration.js';
import { GoogleOauthRequestDto } from '../dto/google-oauth-request.dto.js';
import { OAuthResponseDto } from '../dto/oauth-response.dto.js';
import { OAuthProviderEnum } from '../enums/oauth-provider.enum.js';

@Injectable()
export class GoogleOAuthStrategy extends PassportStrategy(Strategy, 'google-oauth') {
  private readonly client: OAuth2Client;

  constructor(private readonly config: ConfigService) {
    super();
    const cfg = config.get<IGoogleCloudConfig>('googleCloud')!;
    this.client = new OAuth2Client(cfg.clientId, cfg.clientSecret);
  }

  async validate(req: Request): Promise<OAuthResponseDto> {
    try {
      const dto = plainToInstance(GoogleOauthRequestDto, (req as any).body);
      const errors = await validate(dto);
      if (errors.length) throw new BadRequestException();

      const cfg = this.config.get<IGoogleCloudConfig>('googleCloud')!;
      const { tokens } = await this.client.getToken({ code: dto.authCode, redirect_uri: 'postmessage' });
      const ticket = await this.client.verifyIdToken({ idToken: tokens.id_token!, audience: cfg.clientId });
      const payload = ticket.getPayload()!;

      return new OAuthResponseDto({
        providerId: payload.sub,
        providerType: OAuthProviderEnum.Google,
        email: payload.email!,
      });
    } catch (e: any) {
      throw new UnauthorizedException(e?.message ?? 'Google OAuth failed');
    }
  }
}
