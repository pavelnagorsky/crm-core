import { ApiExtraModels, ApiProperty, getSchemaPath } from '@nestjs/swagger';
import { PaymentNextActionType } from '../enums/payment-next-action-type.enum.js';
import type { PaymentNextAction } from '../interfaces/payment-next-action.type.js';
import { PaymentWithNextAction } from '../interfaces/payment-with-next-action.interface.js';
import { InstructionsNextActionDto } from './instructions-next-action.dto.js';
import { NoneNextActionDto } from './none-next-action.dto.js';
import { RedirectNextActionDto } from './redirect-next-action.dto.js';
import { SubscriptionPaymentDto } from './subscription-payment.dto.js';

@ApiExtraModels(
  InstructionsNextActionDto,
  RedirectNextActionDto,
  NoneNextActionDto,
)
export class SubscriptionPaymentWithNextActionResponseDto {
  @ApiProperty({ type: () => SubscriptionPaymentDto })
  payment: SubscriptionPaymentDto;

  @ApiProperty({
    oneOf: [
      { $ref: getSchemaPath(InstructionsNextActionDto) },
      { $ref: getSchemaPath(RedirectNextActionDto) },
      { $ref: getSchemaPath(NoneNextActionDto) },
    ],
    discriminator: {
      propertyName: 'type',
      mapping: {
        [PaymentNextActionType.INSTRUCTIONS]: getSchemaPath(
          InstructionsNextActionDto,
        ),
        [PaymentNextActionType.REDIRECT]: getSchemaPath(RedirectNextActionDto),
        [PaymentNextActionType.NONE]: getSchemaPath(NoneNextActionDto),
      },
    },
  })
  nextAction: PaymentNextAction;

  static fromEntity(
    value: PaymentWithNextAction,
  ): SubscriptionPaymentWithNextActionResponseDto {
    return Object.assign(new SubscriptionPaymentWithNextActionResponseDto(), {
      payment: SubscriptionPaymentDto.fromEntity(value.payment),
      nextAction: value.nextAction,
    });
  }
}
