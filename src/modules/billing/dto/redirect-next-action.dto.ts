import { ApiProperty } from '@nestjs/swagger';
import { PaymentNextActionType } from '../enums/payment-next-action-type.enum.js';

/** Online provider: send the user to the payment page. */
export class RedirectNextActionDto {
  @ApiProperty({ enum: [PaymentNextActionType.REDIRECT] })
  type: PaymentNextActionType.REDIRECT;

  @ApiProperty({ format: 'uri' })
  url: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  expiresAt: Date | null;
}
