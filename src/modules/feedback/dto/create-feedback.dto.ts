import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { IsOptionalPhone } from '../../../shared/decorators/is-phone.decorator.js';
import { TrimString } from '../../../shared/transforms/trim-string.transform.js';

export class CreateFeedbackDto {
  @ApiProperty({ maxLength: 100 })
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 255 })
  @TrimString()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  company?: string | null;

  @IsOptionalPhone()
  @Transform(({ value }) =>
    typeof value === 'string' && !value.trim() ? null : value,
  )
  phone?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 254,
    description: 'At least one of phone or email is required',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() || null : value,
  )
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 5000 })
  @TrimString()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  message?: string | null;
}
