import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { TrimString } from '../../../shared/transforms/trim-string.transform.js';

export class CancelSubscriptionPaymentDto {
  @ApiPropertyOptional({ maxLength: 2000 })
  @TrimString()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  adminNote?: string;
}
