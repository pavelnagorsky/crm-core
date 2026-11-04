import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { isEmail } from 'class-validator';
import { Request } from 'express';
import { Strategy } from 'passport-custom';
import { firstValueFrom } from 'rxjs';
import { IYandexCloudConfig } from '../../../config/interfaces/yandex-cloud-config.interface.js';
import {
  OAUTH_FORM_HTTP_OPTIONS,
  OAUTH_HTTP_OPTIONS,
} from '../constants/oauth-http.constants.js';
import { OAuthResponseDto } from '../dto/oauth-response.dto.js';
import { YandexOauthRequestDto } from '../dto/yandex-oauth-request.dto.js';
import { OAuthProviderEnum } from '../enums/oauth-provider.enum.js';
import { YandexTokensResponse } from '../interfaces/yandex-tokens-response.interface.js';
import { YandexUserResponse } from '../interfaces/yandex-user-response.interface.js';
import { validateOAuthRequest } from '../utils/validate-oauth-request.js';

@Injectable()
export class YandexOAuthStrategy extends PassportStrategy(
  Strategy,
  'yandex-oauth',
) {
  private readonly logger = new Logger(YandexOAuthStrategy.name);
  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {
    super();
  }

  async validate(
    req: Request<Record<string, string>, unknown, unknown>,
  ): Promise<OAuthResponseDto> {
    const dto = await validateOAuthRequest(req, YandexOauthRequestDto);
    const ya = this.config.get<IYandexCloudConfig>('yandexCloud');
    if (!ya?.clientId || !ya.clientSecret) {
      this.logger.warn('oauth failed: provider=yandex reason=NOT_CONFIGURED');
      throw new UnauthorizedException('Yandex sign-in is not configured');
    }

    let reason = 'TOKEN_EXCHANGE_FAILED';
    try {
      const authHeader = Buffer.from(
        `${ya.clientId}:${ya.clientSecret}`,
      ).toString('base64');

      const { data: tokens } = await firstValueFrom(
        this.http.post<YandexTokensResponse>(
          'https://oauth.yandex.ru/token',
          new URLSearchParams({
            grant_type: 'authorization_code',
            code: dto.authCode,
          }),
          {
            ...OAUTH_FORM_HTTP_OPTIONS,
            headers: {
              ...OAUTH_FORM_HTTP_OPTIONS.headers,
              Authorization: `Basic ${authHeader}`,
            },
          },
        ),
      );
      if (
        tokens?.error ||
        typeof tokens?.access_token !== 'string' ||
        !tokens.access_token
      ) {
        throw new UnauthorizedException();
      }

      reason = 'PROFILE_FETCH_FAILED';
      const { data: user } = await firstValueFrom(
        this.http.get<YandexUserResponse>('https://login.yandex.ru/info', {
          ...OAUTH_HTTP_OPTIONS,
          headers: { Authorization: `OAuth ${tokens.access_token}` },
        }),
      );

      reason = 'INVALID_PROFILE';
      if (user?.error || typeof user?.id !== 'string' || !user.id) {
        throw new UnauthorizedException();
      }
      reason = 'EMAIL_MISSING_OR_INVALID';
      if (
        typeof user.default_email !== 'string' ||
        !isEmail(user.default_email)
      ) {
        throw new UnauthorizedException();
      }
      return new OAuthResponseDto({
        providerId: user.id,
        providerType: OAuthProviderEnum.Yandex,
        email: user.default_email,
      });
    } catch {
      this.logger.warn(`oauth failed: provider=yandex reason=${reason}`);
      throw new UnauthorizedException('Yandex OAuth failed');
    }
  }
}
