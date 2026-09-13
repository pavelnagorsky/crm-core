import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { Strategy } from 'passport-custom';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { firstValueFrom } from 'rxjs';
import { IYandexCloudConfig } from '../../../config/configuration.js';
import { YandexOauthRequestDto } from '../dto/yandex-oauth-request.dto.js';
import { OAuthResponseDto } from '../dto/oauth-response.dto.js';
import { OAuthProviderEnum } from '../enums/oauth-provider.enum.js';

interface YandexTokensResponse {
  access_token: string;
  error?: string;
  error_description?: string;
}

interface YandexUserResponse {
  id: string;
  default_email: string;
}

@Injectable()
export class YandexOAuthStrategy extends PassportStrategy(Strategy, 'yandex-oauth') {
  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {
    super();
  }

  async validate(req: Request): Promise<OAuthResponseDto> {
    try {
      const dto = plainToInstance(YandexOauthRequestDto, (req as any).body);
      const errors = await validate(dto);
      if (errors.length) throw new BadRequestException();

      const ya = this.config.get<IYandexCloudConfig>('yandexCloud')!;
      const authHeader = Buffer.from(`${ya.clientId}:${ya.clientSecret}`).toString('base64');

      const { data: tokens } = await firstValueFrom(
        this.http.post<YandexTokensResponse>(
          'https://oauth.yandex.ru/token',
          new URLSearchParams({ grant_type: 'authorization_code', code: dto.authCode }),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Authorization: `Basic ${authHeader}`,
            },
          },
        ),
      );
      if (tokens.error) throw new BadRequestException(tokens.error_description);

      const { data: user } = await firstValueFrom(
        this.http.get<YandexUserResponse>('https://login.yandex.ru/info', {
          headers: { Authorization: `OAuth ${tokens.access_token}` },
        }),
      );

      return new OAuthResponseDto({
        providerId: user.id,
        providerType: OAuthProviderEnum.Yandex,
        email: user.default_email,
      });
    } catch (e: any) {
      throw new UnauthorizedException(e?.message ?? 'Yandex OAuth failed');
    }
  }
}
