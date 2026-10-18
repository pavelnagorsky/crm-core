import { ApiProperty } from '@nestjs/swagger';
import { BusinessRole, User } from '@prisma/client';
import { AccessMembership } from '../interfaces/access-membership.interface.js';
export class AccessMembershipResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() userId: string;
  @ApiProperty({ nullable: true, type: String }) firstName: string | null;
  @ApiProperty({ nullable: true, type: String }) lastName: string | null;
  @ApiProperty({ nullable: true, type: String }) email: string | null;
  @ApiProperty() brandId: string;
  @ApiProperty({ nullable: true, type: String }) locationId: string | null;
  @ApiProperty({ enum: BusinessRole }) role: BusinessRole;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
  static fromEntity(
    row: AccessMembership,
    user: Pick<User, 'firstName' | 'lastName' | 'email'> | undefined,
  ): AccessMembershipResponseDto {
    return Object.assign(new AccessMembershipResponseDto(), row, {
      firstName: user?.firstName ?? null,
      lastName: user?.lastName ?? null,
      email: user?.email ?? null,
    });
  }
}
