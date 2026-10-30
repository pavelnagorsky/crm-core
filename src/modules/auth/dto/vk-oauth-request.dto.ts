import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class VkOauthRequestDto {
  @ApiProperty({ type: String, description: 'VK ID authorization code' })
  @IsString()
  @IsNotEmpty()
  authCode: string;

  @ApiProperty({
    type: String,
    description: 'State from the VK ID SDK callback',
  })
  @IsString()
  @IsNotEmpty()
  state: string;

  @ApiProperty({
    type: String,
    description: 'device_id from the VK ID SDK callback',
  })
  @IsString()
  @IsNotEmpty()
  deviceId: string;
}
