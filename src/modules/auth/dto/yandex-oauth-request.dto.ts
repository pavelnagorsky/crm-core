import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class YandexOauthRequestDto {
  @ApiProperty({ type: String })
  @IsString()
  authCode: string;
}
