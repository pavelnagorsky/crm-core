import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { UserAccessSource } from '../enums/user-access-source.enum.js';
import { UserWithAccessMemberships } from '../interfaces/user-with-access-memberships.interface.js';
import { UserAccessDto } from './user-access.dto.js';

export class UserResponseDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String, nullable: true })
  firstName: string | null;

  @ApiProperty({ type: String, nullable: true })
  lastName: string | null;

  @ApiProperty({ type: String, nullable: true })
  phone: string | null;

  @ApiProperty({ type: String, nullable: true })
  email: string | null;

  @ApiProperty({ type: Date, nullable: true })
  phoneVerifiedAt: Date | null;

  @ApiProperty({ type: Date, nullable: true })
  emailVerifiedAt: Date | null;

  @ApiProperty({ type: Boolean })
  isMarketingEmailsEnabled: boolean;

  @ApiProperty({ type: Date })
  createdAt: Date;

  @ApiProperty({ type: Date })
  updatedAt: Date;

  @ApiProperty({ enum: UserRole })
  role: UserRole;

  @ApiProperty({ type: () => UserAccessDto, isArray: true })
  access: UserAccessDto[];

  static fromEntity(user: UserWithAccessMemberships): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = user.id;
    dto.firstName = user.firstName;
    dto.lastName = user.lastName;
    dto.phone = user.phone;
    dto.email = user.email;
    dto.phoneVerifiedAt = user.phoneVerifiedAt;
    dto.emailVerifiedAt = user.emailVerifiedAt;
    dto.isMarketingEmailsEnabled = user.isMarketingEmailsEnabled;
    dto.createdAt = user.createdAt;
    dto.updatedAt = user.updatedAt;
    dto.role = user.role;
    dto.access = UserResponseDto.accessFromEntity(user);
    return dto;
  }

  private static accessFromEntity(
    user: UserWithAccessMemberships,
  ): UserAccessDto[] {
    const access: UserAccessDto[] = [];

    for (const membership of user.brandMemberships) {
      access.push(UserAccessDto.brand(membership.brandId, membership.role));

      for (const location of membership.brand.locations) {
        access.push(
          UserAccessDto.location(
            membership.brandId,
            location.id,
            membership.role,
            UserAccessSource.INHERITED_BRAND,
          ),
        );
      }
    }

    for (const membership of user.locationMemberships) {
      access.push(
        UserAccessDto.location(
          membership.location.brandId,
          membership.locationId,
          membership.role,
          UserAccessSource.DIRECT,
        ),
      );
    }

    return access;
  }
}
