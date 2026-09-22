import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { IsOptionalPhone } from '../../../shared/decorators/is-phone.decorator.js';
import regularExpressions from '../../../shared/regular-expressions.js';

export class RegisterDto {
  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiProperty({ type: String })
  @IsEmail()
  email: string;

  @ApiProperty({ type: String })
  @IsString()
  @MaxLength(50)
  @Matches(regularExpressions.password)
  password: string;

  @IsOptionalPhone()
  phone?: string;
}
