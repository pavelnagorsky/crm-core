import { ApiProperty } from '@nestjs/swagger';
import { AccessInvitation, AccessInvitationGrant } from '@prisma/client';
import { InvitationGrantResponseDto } from './invitation-grant-response.dto.js';
export class AccessInvitationResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() brandId: string;
  @ApiProperty() issuerId: string;
  @ApiProperty() expiresAt: Date;
  @ApiProperty({ nullable: true, type: Date }) acceptedAt: Date | null;
  @ApiProperty({ nullable: true, type: Date }) revokedAt: Date | null;
  @ApiProperty({ type: [InvitationGrantResponseDto] })
  grants: InvitationGrantResponseDto[];
  static fromEntity(
    row: AccessInvitation & { grants: AccessInvitationGrant[] },
  ): AccessInvitationResponseDto {
    return Object.assign(new AccessInvitationResponseDto(), {
      id: row.id,
      brandId: row.brandId,
      issuerId: row.issuerId,
      expiresAt: row.expiresAt,
      acceptedAt: row.acceptedAt,
      revokedAt: row.revokedAt,
      grants: row.grants.map((g) =>
        Object.assign(new InvitationGrantResponseDto(), {
          role: g.role,
          locationId: g.locationId,
          staffId: g.staffId,
        }),
      ),
    });
  }
}
