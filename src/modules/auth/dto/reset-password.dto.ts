import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MaxLength } from 'class-validator';
import regularExpressions from '../../../shared/regular-expressions.js';

export class ResetPasswordDto {
  @ApiProperty({ type: String })
  @IsEmail()
  @MaxLength(60)
  email: string;

  @ApiProperty({ type: String })
  @IsString()
  @Matches(/^\d{6}$/)
  code: string;

  @ApiProperty({ type: String })
  @IsString()
  @MaxLength(50)
  @Matches(regularExpressions.password)
  password: string;
}
