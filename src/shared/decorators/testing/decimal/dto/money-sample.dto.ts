import { ApiProperty } from '@nestjs/swagger';
import 'reflect-metadata';
import {
  ApiDecimal,
  ApiPercent,
  ApiPrice,
  ApiSignedAmount,
} from '../../../api-decimal.decorator.js';
import { IsSignedAmount } from '../../../is-signed-amount.decorator.js';

export class MoneySampleDto {
  @ApiPrice()
  price: string;

  @ApiPrice({ nullable: true })
  customPrice: string | null;

  @ApiPrice({ required: false, nullable: true })
  draftPrice?: string;

  @ApiSignedAmount()
  amount: string;

  @ApiPercent()
  commissionPercent: string;

  @ApiDecimal({ nullable: true })
  quantity: string | null;

  @ApiProperty({
    example: '1500.00',
    description: 'Bonus must be positive.',
  })
  @IsSignedAmount()
  manualAmount: string;
}
