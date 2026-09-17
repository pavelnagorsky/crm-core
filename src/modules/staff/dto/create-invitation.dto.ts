import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class CreateInvitationDto {
  @ApiProperty({ type: String, example: '2026-10-17T00:00:00.000Z', description: 'Token expiry date (ISO 8601)' })
  @IsDateString()
  expiresAt: string;
}
