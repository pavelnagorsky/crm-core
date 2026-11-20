import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { PaymentMethod } from '../../payments/enums/payment-method.enum.js';

/** Money given back with a product return. Amount and date come from the return. */
export class OrderReturnRefundDto {
  @ApiProperty({ enum: PaymentMethod, enumName: 'PaymentMethod' })
  @IsEnum(PaymentMethod)
  method: PaymentMethod;
}
