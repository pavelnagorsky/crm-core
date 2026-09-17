import { ApiProperty } from '@nestjs/swagger';

export class InvitationResponseDto {
  @ApiProperty({ type: String, description: 'Invitation token to send to the staff member' })
  token: string;
}
