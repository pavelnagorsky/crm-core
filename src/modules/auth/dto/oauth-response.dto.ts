import { OAuthProviderEnum } from '../enums/oauth-provider.enum.js';

export class OAuthResponseDto {
  providerId: string;
  providerType: OAuthProviderEnum;
  email: string;

  constructor(partial: Partial<OAuthResponseDto>) {
    Object.assign(this, partial);
  }
}
