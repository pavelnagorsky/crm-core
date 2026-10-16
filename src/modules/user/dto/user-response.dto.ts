import { ApiProperty } from '@nestjs/swagger';
import { User, UserRole } from '@prisma/client';
import { UserAccessSource } from '../enums/user-access-source.enum.js';
import { UserAccessDto } from './user-access.dto.js';
import { TokenPayloadDto } from '../../auth/dto/token-payload.dto.js';

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

  static fromEntity(user: User, token: TokenPayloadDto): UserResponseDto {
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
    dto.access = UserResponseDto.accessFromToken(token);
    return dto;
  }

  private static accessFromToken(token: TokenPayloadDto): UserAccessDto[] {
    return [
      ...token.brandMemberships.map((row) =>
        UserAccessDto.brand(row.brandId, row.role),
      ),
      ...token.locationMemberships.map((row) =>
        UserAccessDto.location(
          row.brandId,
          row.locationId,
          row.role,
          row.inherited
            ? UserAccessSource.INHERITED_BRAND
            : UserAccessSource.DIRECT,
        ),
      ),
    ];
  }
}
