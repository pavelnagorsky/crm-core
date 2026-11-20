import { ApiProperty } from '@nestjs/swagger';
import { IdResponseDto } from '../../../shared/dto/id-response.dto.js';

/** `id` is the order id. */
export class OrderPaymentResponseDto extends IdResponseDto {
  @ApiProperty({ type: String, format: 'uuid' })
  operationId: string;
}
