import { ApiProperty } from '@nestjs/swagger';
import { BusinessRole } from '@prisma/client';
import { PermissionAccess } from '../enums/permission-access.enum.js';
import { PermissionDto } from './permission.dto.js';

export class AccessPolicyEntryDto extends PermissionDto {
  @ApiProperty({ enum: [PermissionAccess.READ, PermissionAccess.WRITE] })
  declare access: PermissionAccess.READ | PermissionAccess.WRITE;
  @ApiProperty({ enum: BusinessRole }) role: BusinessRole;
  @ApiProperty() defaultAllowed: boolean;
  @ApiProperty() inheritedAllowed: boolean;
  @ApiProperty({ type: Boolean, nullable: true }) override: boolean | null;
  @ApiProperty() allowed: boolean;
  @ApiProperty() configurable: boolean;
  @ApiProperty({ type: [PermissionDto] }) dependencies: PermissionDto[];
}
