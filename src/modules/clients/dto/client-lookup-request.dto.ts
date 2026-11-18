import { ApiHideProperty, ApiProperty, OmitType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { IsPhoneSearch } from '../../../shared/decorators/is-phone-search.decorator.js';
import { PaginationRequestDto } from '../../../shared/dto/pagination-request.dto.js';
import { TrimString } from '../../../shared/transforms/trim-string.transform.js';
import {
  CLIENT_LOOKUP_DEFAULT_PAGE_SIZE,
  CLIENT_LOOKUP_MAX_PAGE_SIZE,
} from '../constants/client-lookup.constants.js';

/**
 * Picking a client while booking: a narrow query, never a dump of the base. Pages like any
 * search, but with a small fixed page, no export and a fixed order.
 */
export class ClientLookupRequestDto extends OmitType(PaginationRequestDto, [
  'pageSize',
  'isExport',
  'orderBy',
  'orderDirection',
] as const) {
  @ApiProperty({
    type: Number,
    default: CLIENT_LOOKUP_DEFAULT_PAGE_SIZE,
    minimum: 1,
    maximum: CLIENT_LOOKUP_MAX_PAGE_SIZE,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(CLIENT_LOOKUP_MAX_PAGE_SIZE)
  pageSize: number = CLIENT_LOOKUP_DEFAULT_PAGE_SIZE;

  @ApiHideProperty()
  @IsOptional()
  @IsIn([], { message: 'isExport is not available for client lookup' })
  isExport?: never;

  @ApiHideProperty()
  @IsOptional()
  @IsIn([], { message: 'orderBy is not available for client lookup' })
  orderBy?: never;

  @IsPhoneSearch()
  phone?: string;

  @ApiProperty({
    type: String,
    required: false,
    maxLength: 255,
    description:
      'Name, phone, email, notes, gender, ban reason. Required when phone is not sent',
  })
  @ValidateIf((dto: ClientLookupRequestDto) => !dto.phone)
  @TrimString()
  @IsString()
  @IsNotEmpty({ message: 'phone or search is required' })
  @MaxLength(255)
  search?: string;
}
