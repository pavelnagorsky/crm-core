import { ApiProperty } from '@nestjs/swagger';
import { BusinessRole } from '@prisma/client';
import { PermissionAccess } from '../enums/permission-access.enum.js';
import type { PermissionGrants } from '../interfaces/permission-grants.interface.js';

export class AccessScopeResponseDto {
  @ApiProperty() brandId: string;
  @ApiProperty({ type: String, nullable: true }) locationId: string | null;
  @ApiProperty({ enum: BusinessRole, nullable: true })
  directRole: BusinessRole | null;
  @ApiProperty({ enum: BusinessRole, nullable: true })
  inheritedRole: BusinessRole | null;
  @ApiProperty({ type: String, nullable: true }) staffId: string | null;
  @ApiProperty({
    type: 'object',
    additionalProperties: {
      type: 'string',
      enum: Object.values(PermissionAccess),
    },
  })
  permissions: PermissionGrants;
  @ApiProperty({
    type: 'object',
    additionalProperties: {
      type: 'string',
      enum: Object.values(PermissionAccess),
    },
  })
  sharedPermissions: PermissionGrants;
}
