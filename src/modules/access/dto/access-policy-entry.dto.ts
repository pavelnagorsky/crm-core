import { ApiProperty } from '@nestjs/swagger';
import { BusinessRole } from '@prisma/client';
import { Permission } from '../enums/permission.enum.js';
export class AccessPolicyEntryDto {
  @ApiProperty({ enum: BusinessRole }) role: BusinessRole;
  @ApiProperty({ enum: Permission }) permission: Permission;
  @ApiProperty() defaultAllowed: boolean;
  @ApiProperty() inheritedAllowed: boolean;
  @ApiProperty({ type: Boolean, nullable: true }) override: boolean | null;
  @ApiProperty() allowed: boolean;
  @ApiProperty() configurable: boolean;
  @ApiProperty({ enum: Permission, isArray: true }) dependencies: Permission[];
}
