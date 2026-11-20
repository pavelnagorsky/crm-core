import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsTimeZone, MaxLength } from 'class-validator';
import { TrimString } from '../../../shared/transforms/trim-string.transform.js';

export class EmailTestRequestDto {
  @ApiProperty({ example: 'admin@klendo.by' })
  @TrimString()
  @IsEmail()
  @MaxLength(320)
  to: string;

  @ApiPropertyOptional({
    example: 'Europe/Minsk',
    description: 'Time zone of the send time shown in the email',
  })
  @IsOptional()
  @IsTimeZone()
  timezone?: string;
}
