import { ApiProperty } from '@nestjs/swagger';
import { Payment } from '@prisma/client';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { PaymentMethod } from '../enums/payment-method.enum.js';

export class PaymentPartDto {
  @ApiProperty({ enum: PaymentMethod, enumName: 'PaymentMethod' })
  method: PaymentMethod;

  @ApiPrice({ description: 'Positive amount of this record.' })
  amount: string;

  static fromEntity(
    payment: Pick<Payment, 'method' | 'amount'>,
  ): PaymentPartDto {
    const dto = new PaymentPartDto();
    dto.method = payment.method;
    dto.amount = MoneyUtils.format(payment.amount);
    return dto;
  }
}
