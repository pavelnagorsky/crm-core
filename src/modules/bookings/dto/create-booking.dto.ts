import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { IsPhone } from '../../../shared/decorators/is-phone.decorator.js';
import { IsLocalDateTime } from '../../time/decorators/is-local-date-time.validator.js';

export class CreateBookingDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  serviceId: string;

  @ApiProperty({ type: String, format: 'uuid', required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  staffId?: string;

  @ApiProperty({ type: String, example: '2026-09-20T10:00:00', description: 'Local datetime in business timezone, no offset' })
  @IsLocalDateTime()
  startAt: string;

  @ApiProperty({ type: String, maxLength: 100 })
  @IsString()
  @MaxLength(100)
  firstName: string;

  @ApiProperty({ type: String, maxLength: 100 })
  @IsString()
  @MaxLength(100)
  lastName: string;

  @IsPhone()
  phone: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiProperty({ type: String, maxLength: 1000, required: false, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
