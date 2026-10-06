import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { TrimLower } from '../decorators/trim.decorator.js';

export class SlugAvailabilityQueryDto {
  @ApiProperty({
    type: String,
    maxLength: 80,
    description:
      'A value longer than 48 characters is INVALID, not a transport error',
  })
  @TrimLower()
  @IsString()
  @MaxLength(80)
  slug: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    description: 'Page being edited, so its current slug stays available',
  })
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsUUID()
  pageId?: string;
}
