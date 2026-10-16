import { ApiProperty } from '@nestjs/swagger';
import { BusinessRole } from '@prisma/client';
export class InvitationGrantResponseDto {
  @ApiProperty({ enum: BusinessRole }) role: BusinessRole;
  @ApiProperty({ type: String, nullable: true }) locationId: string | null;
  @ApiProperty({ type: String, nullable: true }) staffId: string | null;
}
