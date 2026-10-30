import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, ValidateIf } from 'class-validator';
import { GoogleOauthTypeEnum } from '../enums/google-oauth-type.enum.js';

export class GoogleOauthRequestDto {
  @ApiPropertyOptional({
    enum: GoogleOauthTypeEnum,
    enumName: 'GoogleOauthTypeEnum',
    default: GoogleOauthTypeEnum.OAUTH,
    description: 'Google sign-in flow. Defaults to oauth for existing clients.',
  })
  @IsEnum(GoogleOauthTypeEnum)
  type: GoogleOauthTypeEnum = GoogleOauthTypeEnum.OAUTH;

  @ApiPropertyOptional({
    type: String,
    description: 'Authorization code. Required when type is oauth.',
  })
  @ValidateIf(
    (dto: GoogleOauthRequestDto) => dto.type === GoogleOauthTypeEnum.OAUTH,
  )
  @IsString()
  @IsNotEmpty()
  authCode: string;

  @ApiPropertyOptional({
    type: String,
    description: 'Google credential (ID token). Required when type is one-tap.',
  })
  @ValidateIf(
    (dto: GoogleOauthRequestDto) => dto.type === GoogleOauthTypeEnum.ONE_TAP,
  )
  @IsString()
  @IsNotEmpty()
  oneTapCode: string;
}
