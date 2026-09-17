import { ApiProperty } from '@nestjs/swagger';

export class ClientLinkResponseDto {
  @ApiProperty({ type: String })
  url: string;
}
