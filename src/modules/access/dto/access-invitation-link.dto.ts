import { ApiProperty } from '@nestjs/swagger';
import { AccessInvitationResponseDto } from './access-invitation-response.dto.js';
export class AccessInvitationLinkDto {
  @ApiProperty({ type: AccessInvitationResponseDto })
  invitation: AccessInvitationResponseDto;
  @ApiProperty() token: string;
  @ApiProperty() url: string;
}
