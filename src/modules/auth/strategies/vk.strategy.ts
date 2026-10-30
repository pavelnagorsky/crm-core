import { HttpService } from '@nestjs/axios';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { isEmail } from 'class-validator';
import { Request } from 'express';
import { Strategy } from 'passport-custom';
import { firstValueFrom } from 'rxjs';
import { IFrontendConfig } from '../../../config/interfaces/frontend-config.interface.js';
import { IVKConfig } from '../../../config/interfaces/vk-config.interface.js';
import { OAuthResponseDto } from '../dto/oauth-response.dto.js';
import { VkOauthRequestDto } from '../dto/vk-oauth-request.dto.js';
import { OAuthProviderEnum } from '../enums/oauth-provider.enum.js';
import { VkTokensResponse } from '../interfaces/vk-tokens-response.interface.js';
import { VkUserResponse } from '../interfaces/vk-user-response.interface.js';
import { validateOAuthRequest } from '../utils/validate-oauth-request.js';

@Injectable()
export class VkOAuthStrategy extends PassportStrategy(Strategy, 'vk-oauth') {
  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {
    super();
  }

  async validate(
    req: Request<Record<string, string>, unknown, unknown>,
  ): Promise<OAuthResponseDto> {
    const dto = await validateOAuthRequest(req, VkOauthRequestDto);
    const vk = this.config.get<IVKConfig>('vk');
    const frontend = this.config.get<IFrontendConfig>('frontend');
    if (!vk?.clientId || !vk.codeVerifier || !frontend?.domain) {
      throw new UnauthorizedException('VK sign-in is not configured');
    }

    try {
      const { data: tokens } = await firstValueFrom(
        this.http.post<VkTokensResponse>(
          'https://id.vk.com/oauth2/auth',
          new URLSearchParams({
            grant_type: 'authorization_code',
            code: dto.authCode,
            client_id: vk.clientId,
            device_id: dto.deviceId,
            state: dto.state,
            code_verifier: vk.codeVerifier,
            redirect_uri: new URL(
              '/auth/oauth/callback',
              frontend.domain,
            ).toString(),
          }),
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
        ),
      );
      if (
        tokens?.error ||
        !tokens?.access_token ||
        !Number.isSafeInteger(tokens.user_id) ||
        tokens.user_id <= 0 ||
        tokens.state !== dto.state
      ) {
        throw new UnauthorizedException();
      }

      const { data: profile } = await firstValueFrom(
        this.http.post<VkUserResponse>(
          'https://id.vk.com/oauth2/user_info',
          new URLSearchParams({
            client_id: vk.clientId,
            access_token: tokens.access_token,
          }),
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
        ),
      );
      if (
        profile?.error ||
        !profile?.user?.email ||
        !isEmail(profile.user.email)
      ) {
        throw new UnauthorizedException();
      }
      if (
        profile.user.user_id &&
        profile.user.user_id !== String(tokens.user_id)
      ) {
        throw new UnauthorizedException();
      }

      return new OAuthResponseDto({
        providerId: String(tokens.user_id),
        providerType: OAuthProviderEnum.VK,
        email: profile.user.email,
      });
    } catch {
      throw new UnauthorizedException('VK OAuth failed');
    }
  }
}
