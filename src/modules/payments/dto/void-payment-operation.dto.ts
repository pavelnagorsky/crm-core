import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { TrimString } from '../../../shared/transforms/trim-string.transform.js';

export class VoidPaymentOperationDto {
  @ApiProperty({
    type: String,
    maxLength: 500,
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @TrimString()
  @MaxLength(500)
  reason?: string | null;
}
