import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Strategy } from 'passport-custom';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { firstValueFrom } from 'rxjs';
import { IFrontendConfig, IVKConfig } from '../../../config/configuration.js';
import { VkOauthRequestDto } from '../dto/vk-oauth-request.dto.js';
import { OAuthResponseDto } from '../dto/oauth-response.dto.js';
import { OAuthProviderEnum } from '../enums/oauth-provider.enum.js';

interface VkTokensResponse {
  access_token: string;
  refresh_token: string;
  user_id: number;
  error?: string;
  error_description?: string;
}

interface VkUserResponse {
  user: { id: number; first_name: string; last_name: string; email: string };
}

@Injectable()
export class VkOAuthStrategy extends PassportStrategy(Strategy, 'vk-oauth') {
  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {
    super();
  }

  async validate(req: Request): Promise<OAuthResponseDto> {
    try {
      const dto = plainToInstance(VkOauthRequestDto, (req as any).body);
      const errors = await validate(dto);
      if (errors.length) throw new BadRequestException();

      const vk = this.config.get<IVKConfig>('vk')!;
      const frontend = this.config.get<IFrontendConfig>('frontend')!;

      const { data: tokens } = await firstValueFrom(
        this.http.post<VkTokensResponse>(
          'https://id.vk.com/oauth2/auth',
          {
            grant_type: 'authorization_code',
            code: dto.authCode,
            client_id: vk.clientId,
            device_id: dto.deviceId,
            state: dto.state,
            code_verifier: vk.codeVerifier,
            redirect_uri: `https://${frontend.domain}/auth/oauth/callback`,
          },
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
        ),
      );
      if (tokens.error) throw new BadRequestException(tokens.error_description);

      const { data: profile } = await firstValueFrom(
        this.http.post<VkUserResponse>(
          'https://id.vk.com/oauth2/user_info',
          { client_id: vk.clientId, access_token: tokens.access_token },
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
        ),
      );
      if (!profile.user?.email) throw new BadRequestException('No user email from VK');

      return new OAuthResponseDto({
        providerId: String(tokens.user_id),
        providerType: OAuthProviderEnum.VK,
        email: profile.user.email,
      });
    } catch (e: any) {
      throw new UnauthorizedException(e?.message ?? 'VK OAuth failed');
    }
  }
}
