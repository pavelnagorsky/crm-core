import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { IsOptionalPhone } from '../../../shared/decorators/is-phone.decorator.js';

export class CreateStaffDto {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  businessId: string;

  @ApiProperty({ type: String, maxLength: 250 })
  @IsString()
  @MaxLength(250)
  name: string;

  @ApiProperty({
    type: String,
    maxLength: 250,
    required: false,
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  roleTitle?: string;

  @IsOptionalPhone()
  phone?: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  avatarFileId?: string;

  @ApiProperty({
    type: [String],
    required: false,
    description: 'UUIDs of services this staff member can perform',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  serviceIds?: string[];
}
