import { ApiProperty } from '@nestjs/swagger';
import { BusinessRole } from '@prisma/client';
import { IsEnum, IsIn } from 'class-validator';
import { PermissionValue } from '../enums/permission-value.enum.js';
import { Permission } from '../enums/permission.enum.js';
export class PermissionChangeDto {
  @ApiProperty({ enum: [BusinessRole.MANAGER, BusinessRole.STAFF] })
  @IsIn([BusinessRole.MANAGER, BusinessRole.STAFF])
  role: BusinessRole;
  @ApiProperty({ enum: Permission }) @IsEnum(Permission) permission: Permission;
  @ApiProperty({ enum: PermissionValue })
  @IsEnum(PermissionValue)
  value: PermissionValue;
}
