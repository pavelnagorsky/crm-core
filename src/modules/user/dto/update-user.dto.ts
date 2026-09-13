import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import regularExpressions from '../../../shared/regular-expressions.js';
import { NormalizePhone } from '../../../shared/transforms/normalize-phone.transform.js';

export class UpdateUserDto {
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

  @ApiPropertyOptional({ type: String, example: '+375292332000' })
  @IsOptional()
  @NormalizePhone()
  @IsString()
  @MaxLength(30)
  @Matches(regularExpressions.phone, { message: 'phone must be in E.164 format (+375...)' })
  phone?: string;

  @ApiPropertyOptional({ type: String })
  @IsOptional()
  @IsEmail()
  email?: string;
}
