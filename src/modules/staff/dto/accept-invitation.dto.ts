import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class AcceptInvitationDto {
  @ApiProperty({
    type: String,
    description: 'Invitation token received via invitation link',
  })
  @IsString()
  @IsNotEmpty()
  token: string;
}
