import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsEmail, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import regularExpressions from '../../../shared/regular-expressions.js';
import { NormalizePhone } from '../../../shared/transforms/normalize-phone.transform.js';

export class CreateClientDto {
  @ApiProperty({ type: String, maxLength: 100 })
  @IsString()
  @MaxLength(100)
  firstName: string;

  @ApiProperty({ type: String, maxLength: 100 })
  @IsString()
  @MaxLength(100)
  lastName: string;

  @ApiProperty({ type: String, example: '+375292332000' })
  @NormalizePhone()
  @IsString()
  @MaxLength(30)
  @Matches(regularExpressions.phone, { message: 'phone must be in E.164 format (+375...)' })
  phone: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiProperty({ type: String, format: 'date', required: false, nullable: true })
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiProperty({ type: String, maxLength: 20, required: false, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  gender?: string;

  @ApiProperty({ type: String, maxLength: 1000, required: false, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
