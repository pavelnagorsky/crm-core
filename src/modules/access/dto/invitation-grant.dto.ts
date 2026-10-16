import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BusinessRole } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { AccessScope } from '../enums/access-scope.enum.js';
export class InvitationGrantDto {
  @ApiProperty({ enum: AccessScope }) @IsEnum(AccessScope) scope: AccessScope;
  @ApiProperty({ enum: BusinessRole }) @IsEnum(BusinessRole) role: BusinessRole;
  @ApiPropertyOptional() @IsOptional() @IsUUID() locationId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() staffId?: string;
}
