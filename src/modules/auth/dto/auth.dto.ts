import { ApiProperty } from '@nestjs/swagger';

export class AuthDto {
  @ApiProperty({ type: String })
  accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }
}
