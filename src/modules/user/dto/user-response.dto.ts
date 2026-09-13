import { ApiProperty } from '@nestjs/swagger';
import { User } from '@prisma/client';

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

  static fromEntity(user: User): UserResponseDto {
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
    return dto;
  }
}
