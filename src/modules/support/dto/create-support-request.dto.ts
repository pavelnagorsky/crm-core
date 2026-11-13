import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { TrimString } from '../../../shared/transforms/trim-string.transform.js';

export class CreateSupportRequestDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 254,
    description:
      'Required for guests. For signed-in users null or empty means "reply to the account email"',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() || null : value,
  )
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string | null;

  @ApiProperty({
    minLength: 1,
    maxLength: 5000,
    description: 'Plain text; HTML is stored as-is and never rendered',
  })
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  message: string;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    isArray: true,
    maxItems: 10,
    description:
      'Attachments uploaded via POST /support-requests/attachments, in display order. Signed-in users only; each must belong to the caller and not be sent yet',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  fileIds?: string[];
}
