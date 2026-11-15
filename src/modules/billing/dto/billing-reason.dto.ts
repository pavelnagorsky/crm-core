import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { TrimString } from '../../../shared/transforms/trim-string.transform.js';

/** Admin action that needs a reason in the subscription history. */
export class BillingReasonDto {
  @ApiProperty({ maxLength: 500, example: 'Договорились по телефону' })
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
