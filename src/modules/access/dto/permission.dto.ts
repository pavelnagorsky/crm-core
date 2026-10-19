import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { Claim } from '../enums/claim.enum.js';
import { PermissionAccess } from '../enums/permission-access.enum.js';
import { Permission } from '../interfaces/permission.interface.js';

export class PermissionDto implements Permission {
  @ApiProperty({ enum: Claim })
  @IsEnum(Claim)
  claim: Claim;

  @ApiProperty({ enum: PermissionAccess })
  @IsEnum(PermissionAccess)
  access: PermissionAccess;
}
