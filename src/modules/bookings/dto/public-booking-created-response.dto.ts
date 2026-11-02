import { ApiProperty } from '@nestjs/swagger';
import { ClientLinkResponseDto } from './client-link-response.dto.js';
import { ClientBookingResponseDto } from './client-booking-response.dto.js';

export class PublicBookingCreatedResponseDto extends ClientLinkResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  id: string;

  @ApiProperty({ type: () => ClientBookingResponseDto })
  booking: ClientBookingResponseDto;
}
