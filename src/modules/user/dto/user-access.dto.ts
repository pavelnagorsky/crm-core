import { ApiProperty } from '@nestjs/swagger';
import { BusinessRole } from '@prisma/client';
import { UserAccessScope } from '../enums/user-access-scope.enum.js';
import { UserAccessSource } from '../enums/user-access-source.enum.js';

export class UserAccessDto {
  @ApiProperty({ enum: UserAccessScope })
  scope: UserAccessScope;

  @ApiProperty({ type: String })
  brandId: string;

  @ApiProperty({ type: String, nullable: true })
  locationId: string | null;

  @ApiProperty({ enum: BusinessRole })
  role: BusinessRole;

  @ApiProperty({ enum: UserAccessSource })
  source: UserAccessSource;

  static brand(brandId: string, role: BusinessRole): UserAccessDto {
    const dto = new UserAccessDto();
    dto.scope = UserAccessScope.BRAND;
    dto.brandId = brandId;
    dto.locationId = null;
    dto.role = role;
    dto.source = UserAccessSource.DIRECT;
    return dto;
  }

  static location(
    brandId: string,
    locationId: string,
    role: BusinessRole,
    source: UserAccessSource,
  ): UserAccessDto {
    const dto = new UserAccessDto();
    dto.scope = UserAccessScope.LOCATION;
    dto.brandId = brandId;
    dto.locationId = locationId;
    dto.role = role;
    dto.source = source;
    return dto;
  }
}
