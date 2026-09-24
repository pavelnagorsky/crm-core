import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { IsOptionalPhone } from '../../../shared/decorators/is-phone.decorator.js';
import regularExpressions from '../../../shared/regular-expressions.js';
import { StaffStatus } from '../enums/staff-status.enum.js';
import { StaffEmploymentType } from '../enums/staff-employment-type.enum.js';
import { StaffPayoutMethod } from '../enums/staff-payout-method.enum.js';

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

  @ApiProperty({ enum: StaffEmploymentType, enumName: 'StaffEmploymentType', required: false, nullable: true })
  @IsOptional()
  @IsEnum(StaffEmploymentType)
  employmentType?: StaffEmploymentType;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @Matches(regularExpressions.taxId)
  taxId?: string;

  @ApiProperty({ type: String, required: false, nullable: true, maxLength: 30 })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  employeeNumber?: string;

  @ApiProperty({ enum: StaffPayoutMethod, enumName: 'StaffPayoutMethod', required: false, nullable: true })
  @IsOptional()
  @IsEnum(StaffPayoutMethod)
  payoutMethod?: StaffPayoutMethod;

  @ApiProperty({ type: String, required: false, nullable: true, maxLength: 250 })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  payoutNote?: string;
}
