import { ApiProperty } from '@nestjs/swagger';
import { PaymentNextActionType } from '../enums/payment-next-action-type.enum.js';

/** Nothing to do: the payment is not PENDING. */
export class NoneNextActionDto {
  @ApiProperty({ enum: [PaymentNextActionType.NONE] })
  type: PaymentNextActionType.NONE;
}
