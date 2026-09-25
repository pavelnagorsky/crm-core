import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { IsSignedAmount } from '../../../../shared/decorators/is-signed-amount.decorator.js';
import { TrimString } from '../../../../shared/transforms/trim-string.transform.js';

export class CreatePayrollCorrectionDto {
  @IsSignedAmount()
  amount: string;

  @ApiProperty({ type: String, maxLength: 1000 })
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;
}
