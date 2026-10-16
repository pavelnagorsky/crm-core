import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BusinessRole } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsUUID, Min } from 'class-validator';
export class ChangeMembershipDto {
  @ApiProperty({ enum: BusinessRole }) @IsEnum(BusinessRole) role: BusinessRole;
  @ApiProperty() @IsInt() @Min(0) expectedVersion: number;
  @ApiPropertyOptional() @IsOptional() @IsUUID() staffId?: string;
}
