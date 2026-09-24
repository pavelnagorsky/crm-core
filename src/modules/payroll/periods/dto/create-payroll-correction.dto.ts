import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';
import { IsSignedAmount } from '../../../../shared/decorators/is-signed-amount.decorator.js';

export class CreatePayrollCorrectionDto {
  @IsSignedAmount()
  amount: string;

  @ApiProperty({ type: String, maxLength: 1000 })
  @IsString()
  @MaxLength(1000)
  reason: string;
}
