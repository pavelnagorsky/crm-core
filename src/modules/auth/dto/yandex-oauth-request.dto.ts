import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class YandexOauthRequestDto {
  @ApiProperty({ type: String, description: 'Yandex authorization code' })
  @IsString()
  @IsNotEmpty()
  authCode: string;
}
