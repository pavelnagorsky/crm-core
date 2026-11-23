import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class UndoBookingPaymentDto {
  @ApiProperty({
    type: String,
    format: 'uuid',
    description:
      'The payment operation to undo (operationId of PUT bookings/:id/payment).',
  })
  @IsUUID()
  operationId: string;
}
