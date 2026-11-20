import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { EMAIL_BULK_LIMIT } from '../constants/email-queue.constants.js';
import { EmailFilterDto } from './email-filter.dto.js';

/** Either the selected emails or every email matching the filter; `ids` wins when both are sent. */
export class EmailBulkRequestDto {
  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(EMAIL_BULK_LIMIT)
  @IsUUID('all', { each: true })
  ids?: string[];

  @ApiPropertyOptional({
    type: () => EmailFilterDto,
    description: `Applies to at most ${EMAIL_BULK_LIMIT} matching emails, oldest first`,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => EmailFilterDto)
  filter?: EmailFilterDto;
}
