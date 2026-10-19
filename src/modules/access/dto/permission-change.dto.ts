import { ApiProperty } from '@nestjs/swagger';
import { BusinessRole } from '@prisma/client';
import { IsEnum, IsIn } from 'class-validator';
import { Claim } from '../enums/claim.enum.js';
import { PermissionAccess } from '../enums/permission-access.enum.js';
import { PermissionEffect } from '../enums/permission-effect.enum.js';

export class PermissionChangeDto {
  @ApiProperty({ enum: [BusinessRole.MANAGER, BusinessRole.STAFF] })
  @IsIn([BusinessRole.MANAGER, BusinessRole.STAFF])
  role: BusinessRole;

  @ApiProperty({ enum: Claim })
  @IsEnum(Claim)
  claim: Claim;

  @ApiProperty({ enum: [PermissionAccess.READ, PermissionAccess.WRITE] })
  @IsIn([PermissionAccess.READ, PermissionAccess.WRITE])
  access: PermissionAccess;

  @ApiProperty({ enum: PermissionEffect })
  @IsEnum(PermissionEffect)
  effect: PermissionEffect;
}
