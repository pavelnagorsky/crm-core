import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MaxLength } from 'class-validator';

export class SendAccessInvitationDto {
  @ApiProperty({ example: 'employee@example.com' })
  @IsEmail()
  @MaxLength(254)
  email: string;
}
