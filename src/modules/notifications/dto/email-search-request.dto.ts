import { ApiPropertyOptional } from '@nestjs/swagger';
import { EmailAudience, EmailStatus } from '@prisma/client';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationRequestDto } from '../../../shared/dto/pagination-request.dto.js';
import { ToArray } from '../../../shared/transforms/to-array.transform.js';
import { TrimString } from '../../../shared/transforms/trim-string.transform.js';
import { EmailMessageOrderBy } from '../enums/email-message-order-by.enum.js';
import { EmailTemplate } from '../enums/email-template.enum.js';
import { EmailFilter } from '../interfaces/email-filter.interface.js';

/** Default order: newest first by `queuedAt`. */
export class EmailSearchRequestDto
  extends PaginationRequestDto<EmailMessageOrderBy>
  implements EmailFilter
{
  @ApiPropertyOptional({
    enum: EmailStatus,
    enumName: 'EmailStatus',
    isArray: true,
    description: 'Repeat the key: ?status=FAILED&status=RETRYING',
  })
  @IsOptional()
  @ToArray()
  @IsArray()
  @IsEnum(EmailStatus, { each: true })
  status?: EmailStatus[];

  @ApiPropertyOptional({
    enum: EmailTemplate,
    enumName: 'EmailTemplate',
    isArray: true,
  })
  @IsOptional()
  @ToArray()
  @IsArray()
  @IsEnum(EmailTemplate, { each: true })
  template?: EmailTemplate[];

  @ApiPropertyOptional({ enum: EmailAudience, enumName: 'EmailAudience' })
  @IsOptional()
  @IsEnum(EmailAudience)
  audience?: EmailAudience;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  brandId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  bookingId?: string;

  @ApiPropertyOptional({ description: 'Part of the recipient or the subject' })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(320)
  search?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Queued at or after, inclusive',
  })
  @IsOptional()
  @IsDateString()
  queuedFrom?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Queued before, exclusive',
  })
  @IsOptional()
  @IsDateString()
  queuedTo?: string;
}
