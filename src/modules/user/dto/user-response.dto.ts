import { ApiProperty } from '@nestjs/swagger';
import { BrandMembership, BusinessRole, User, UserRole } from '@prisma/client';
import { TokenPayloadDto } from '../../auth/dto/token-payload.dto.js';

export class MembershipResponseDto {
  @ApiProperty({ type: String })
  brandId: string;

  @ApiProperty({ enum: BusinessRole })
  role: BusinessRole;
}

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

  @ApiProperty({ type: () => MembershipResponseDto, isArray: true })
  brandMemberships: MembershipResponseDto[];

  static fromEntity(
    user: User & { brandMemberships: BrandMembership[] },
    payload: TokenPayloadDto,
  ): UserResponseDto {
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
    dto.role = payload.role;
    dto.brandMemberships = user.brandMemberships.map((m: BrandMembership) => {
      const membership = new MembershipResponseDto();
      membership.brandId = m.brandId;
      membership.role = m.role;
      return membership;
    });
    return dto;
  }
}
