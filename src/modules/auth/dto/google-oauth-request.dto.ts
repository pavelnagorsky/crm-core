import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class GoogleOauthRequestDto {
  @ApiProperty({ type: String, description: 'Google auth code' })
  @IsString()
  authCode: string;
}
