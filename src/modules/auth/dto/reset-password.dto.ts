import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';
import regularExpressions from '../../../shared/regular-expressions.js';

export class ResetPasswordDto {
  @ApiProperty({ type: String })
  @IsString()
  @MaxLength(50)
  @Matches(regularExpressions.password)
  password: string;
}
