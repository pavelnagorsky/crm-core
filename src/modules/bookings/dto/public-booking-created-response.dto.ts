import { ApiProperty } from '@nestjs/swagger';
import { ClientLinkResponseDto } from './client-link-response.dto.js';

export class PublicBookingCreatedResponseDto extends ClientLinkResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id: string;
}
