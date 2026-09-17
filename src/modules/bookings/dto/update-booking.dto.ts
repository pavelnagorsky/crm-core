import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { IsOptionalPrice } from '../../../shared/decorators/is-price.decorator.js';
import { IsLocalDateTime } from '../../time/decorators/is-local-date-time.validator.js';
import { IsPhone } from '../../../shared/decorators/is-phone.decorator.js';

export class UpdateBookingDto {
  @ApiProperty({ type: String, format: 'uuid', required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  staffId?: string;

  @ApiProperty({ type: String, format: 'uuid', required: false })
  @IsOptional()
  @IsUUID()
  serviceId?: string;

  @ApiProperty({ type: String, example: '2026-09-20T10:00:00', required: false })
  @IsOptional()
  @IsLocalDateTime()
  startAt?: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsPhone()
  phone?: string;

  @ApiProperty({ type: String, maxLength: 100, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiProperty({ type: String, maxLength: 100, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptionalPrice()
  customPrice?: string;

  @ApiProperty({ type: String, maxLength: 1000, required: false, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiProperty({ type: String, maxLength: 2000, required: false, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  internalNotes?: string;
}
