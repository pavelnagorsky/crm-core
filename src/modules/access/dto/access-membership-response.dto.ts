import { ApiProperty } from '@nestjs/swagger';
import { BusinessRole } from '@prisma/client';
export class AccessMembershipResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() userId: string;
  @ApiProperty() brandId: string;
  @ApiProperty({ nullable: true, type: String }) locationId: string | null;
  @ApiProperty({ enum: BusinessRole }) role: BusinessRole;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
  static fromEntity(
    row: AccessMembershipResponseDto,
  ): AccessMembershipResponseDto {
    return Object.assign(new AccessMembershipResponseDto(), row);
  }
}
