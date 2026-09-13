import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Matches, MaxLength } from 'class-validator';
import regularExpressions from '../../../shared/regular-expressions.js';

export class LoginDto {
  @ApiProperty({ type: String })
  @IsEmail()
  email: string;

  @ApiProperty({ type: String })
  @IsString()
  @MaxLength(50)
  @Matches(regularExpressions.password)
  password: string;
}
