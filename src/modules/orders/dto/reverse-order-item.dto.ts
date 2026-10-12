import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { TrimString } from '../../../shared/transforms/trim-string.transform.js';

export class ReverseOrderItemDto {
  @ApiProperty({ type: String, minLength: 1, maxLength: 500 })
  @IsString()
  @TrimString()
  @MinLength(1)
  @MaxLength(500)
  reason: string;
}
