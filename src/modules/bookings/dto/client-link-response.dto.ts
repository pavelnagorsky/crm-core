import { ApiProperty } from '@nestjs/swagger';

export class ClientLinkResponseDto {
  @ApiProperty({ type: String })
  token: string;

  @ApiProperty({ type: String, format: 'uri' })
  manageUrl: string;
}
