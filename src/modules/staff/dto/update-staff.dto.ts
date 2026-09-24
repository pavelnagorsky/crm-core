import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { IsOptionalPhone } from '../../../shared/decorators/is-phone.decorator.js';
import { StaffStatus } from '../enums/staff-status.enum.js';

export class UpdateStaffDto {
  @ApiProperty({ type: String, maxLength: 250, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  name?: string;

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
    description:
      'UUIDs of services this staff member can perform — replaces the full set',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  serviceIds?: string[];

  @ApiProperty({ enum: StaffStatus, enumName: 'StaffStatus', required: false })
  @IsOptional()
  @IsEnum(StaffStatus)
  status?: StaffStatus;
}
