import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsSignedAmount } from '../../../../shared/decorators/is-signed-amount.decorator.js';
import { StaffEarningType } from '../enums/staff-earning-type.enum.js';

const manualTypes = [StaffEarningType.BONUS, StaffEarningType.DEDUCTION, StaffEarningType.CORRECTION] as const;

export class CreateManualEarningDto {
  @ApiProperty({ enum: manualTypes })
  @IsEnum(manualTypes)
  type: (typeof manualTypes)[number];

  @ApiProperty({
    type: String,
    example: '1500.00',
    description: 'Bonus must be positive. Deduction may be positive (stored negative) or already negative. Correction is signed.',
  })
  @IsSignedAmount()
  amount: string;

  @ApiProperty({ type: String, maxLength: 1000 })
  @IsString()
  @MaxLength(1000)
  reason: string;

  @ApiProperty({ type: String, required: false, example: '2026-09-15' })
  @IsOptional()
  @IsDateString()
  earnedOn?: string;
}
