import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class UpdateStaffDto {
  @ApiProperty({ type: String, maxLength: 250, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  name?: string;

  @ApiProperty({ type: String, maxLength: 250, required: false, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  roleTitle?: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  avatarFileId?: string;

  @ApiProperty({ type: Boolean, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ type: [String], required: false, description: 'UUIDs of services this staff member can perform — replaces the full set' })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  serviceIds?: string[];
}
