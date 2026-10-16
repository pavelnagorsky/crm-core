import { ApiProperty } from '@nestjs/swagger';
import { BusinessRole } from '@prisma/client';
import { Permission } from '../enums/permission.enum.js';

export class AccessScopeResponseDto {
  @ApiProperty() brandId: string;
  @ApiProperty({ type: String, nullable: true }) locationId: string | null;
  @ApiProperty({ enum: BusinessRole, nullable: true })
  directRole: BusinessRole | null;
  @ApiProperty({ enum: BusinessRole, nullable: true })
  inheritedRole: BusinessRole | null;
  @ApiProperty({ type: String, nullable: true }) staffId: string | null;
  @ApiProperty({ enum: Permission, isArray: true }) permissions: Permission[];
  @ApiProperty({ enum: Permission, isArray: true })
  sharedPermissions: Permission[];
}
