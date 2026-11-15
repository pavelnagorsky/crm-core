import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { PaymentNextActionType } from '../enums/payment-next-action-type.enum.js';

/** OFFLINE: show the payment details and the payment purpose. */
export class InstructionsNextActionDto {
  @ApiProperty({ enum: [PaymentNextActionType.INSTRUCTIONS] })
  type: PaymentNextActionType.INSTRUCTIONS;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      'Payment details from the platform settings, plain text with line breaks',
  })
  instructions: string | null;

  @ApiProperty({
    example: 'KL-000123',
    description: 'Put into the payment purpose',
  })
  reference: string;

  @ApiPrice()
  amount: string;

  @ApiProperty({ example: 'BYN' })
  currency: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  expiresAt: Date | null;
}
