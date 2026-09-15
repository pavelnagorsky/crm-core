import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateStaffDto {
  @ApiProperty({ type: String, maxLength: 250 })
  @IsString()
  @MaxLength(250)
  name: string;

  @ApiProperty({ type: String, maxLength: 250, required: false, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  roleTitle?: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  avatarFileId?: string;

  @ApiProperty({ type: Boolean, required: false, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ type: [String], required: false, description: 'UUIDs of services this staff member can perform' })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  serviceIds?: string[];
}
