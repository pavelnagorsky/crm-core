import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class VkOauthRequestDto {
  @ApiProperty({ type: String })
  @IsString()
  authCode: string;

  @ApiProperty({ type: String })
  @IsString()
  state: string;

  @ApiProperty({ type: String })
  @IsString()
  deviceId: string;
}
