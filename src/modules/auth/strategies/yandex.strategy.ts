import { HttpService } from '@nestjs/axios';
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
import { Strategy } from 'passport-custom';
import { firstValueFrom } from 'rxjs';
import { IYandexCloudConfig } from '../../../config/interfaces/yandex-cloud-config.interface.js';
import { OAuthResponseDto } from '../dto/oauth-response.dto.js';
import { YandexOauthRequestDto } from '../dto/yandex-oauth-request.dto.js';
import { OAuthProviderEnum } from '../enums/oauth-provider.enum.js';
import { YandexTokensResponse } from '../interfaces/yandex-tokens-response.interface.js';
import { YandexUserResponse } from '../interfaces/yandex-user-response.interface.js';

@Injectable()
export class YandexOAuthStrategy extends PassportStrategy(
  Strategy,
  'yandex-oauth',
) {
  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {
    super();
  }

  async validate(
    req: Request<Record<string, string>, unknown, unknown>,
  ): Promise<OAuthResponseDto> {
    try {
      const dto = plainToInstance(YandexOauthRequestDto, req.body);
      const errors = await validate(dto);
      if (errors.length) throw new BadRequestException();

      const ya = this.config.get<IYandexCloudConfig>('yandexCloud')!;
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

      if (!user.default_email)
        throw new UnauthorizedException('No user email from Yandex');
      return new OAuthResponseDto({
        providerId: user.id,
        providerType: OAuthProviderEnum.Yandex,
        email: user.default_email,
      });
    } catch {
      throw new UnauthorizedException('Yandex OAuth failed');
    }
  }
}
