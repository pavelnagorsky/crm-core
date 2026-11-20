import { ApiProperty } from '@nestjs/swagger';
import { IdResponseDto } from '../../../shared/dto/id-response.dto.js';

/** `id` is the booking id. */
export class PayBookingResponseDto extends IdResponseDto {
  @ApiProperty({ type: String, format: 'uuid', description: 'Visit order' })
  orderId: string;

  @ApiProperty({ type: String, format: 'uuid' })
  operationId: string;
}
