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
import { StaffEmploymentType } from '../enums/staff-employment-type.enum.js';
import { StaffPayoutMethod } from '../enums/staff-payout-method.enum.js';

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

  @ApiProperty({ type: String, maxLength: 2000, required: false, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

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
    description: 'Ids of services this staff member can perform. A bundle can be booked with them when they can perform every service in that bundle. Bundle ids are not accepted.',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  serviceIds?: string[];

  @ApiProperty({ enum: StaffEmploymentType, enumName: 'StaffEmploymentType', required: false, nullable: true })
  @IsOptional()
  @IsEnum(StaffEmploymentType)
  employmentType?: StaffEmploymentType;

  @ApiProperty({ type: String, required: false, nullable: true, example: '7701234567' })
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
