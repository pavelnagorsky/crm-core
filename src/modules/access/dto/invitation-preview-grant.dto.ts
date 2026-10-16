import { ApiProperty } from '@nestjs/swagger';
import { BusinessRole } from '@prisma/client';

export class InvitationPreviewGrantDto {
  @ApiProperty({ enum: BusinessRole }) role: BusinessRole;
  @ApiProperty({ type: String, nullable: true }) locationName: string | null;
}
