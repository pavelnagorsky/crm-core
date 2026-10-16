import { ApiProperty } from '@nestjs/swagger';
import { InvitationPreviewGrantDto } from './invitation-preview-grant.dto.js';

export class InvitationPreviewDto {
  @ApiProperty() brandName: string;
  @ApiProperty() expiresAt: Date;
  @ApiProperty({ type: [InvitationPreviewGrantDto] })
  grants: InvitationPreviewGrantDto[];
}
