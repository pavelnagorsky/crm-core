import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { PaginationRequestDto } from '../../../shared/dto/pagination-request.dto.js';
import regularExpressions from '../../../shared/regular-expressions.js';
import { DigitsOnly } from '../../../shared/transforms/digits-only.transform.js';
import { ClientSearchOrderBy } from '../enums/client-search-order-by.enum.js';

export class ClientSearchRequestDto extends PaginationRequestDto<ClientSearchOrderBy> {
  @ApiProperty({
    type: String,
    required: false,
    description: 'Name, phone, email, notes, gender, ban reason',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiProperty({
    type: String,
    required: false,
    example: '8029233',
    description:
      'Phone only, compared by digits: spaces, brackets, dashes and + are ignored. At least 3 digits, matched anywhere in the number. A leading 80 also finds +375 numbers (Belarus), another leading 8 finds +7 (Russia), 00 is the international prefix. Numbers that start with the typed digits (with or without the +375 / +7 country code) come first, then the rest, each group in the requested order. Combines with search and banned.',
  })
  @IsOptional()
  @DigitsOnly()
  @Matches(regularExpressions.phoneSearchDigits, {
    message: 'phone must contain from 3 to 20 digits',
  })
  phone?: string;

  @ApiProperty({
    type: Boolean,
    required: false,
    description:
      'true — only banned clients, false — only clients allowed to book online',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toLowerCase() === 'true' : value,
  )
  @IsBoolean()
  banned?: boolean;

  @ApiProperty({ enum: ClientSearchOrderBy, required: false })
  @IsOptional()
  @IsEnum(ClientSearchOrderBy)
  declare orderBy?: ClientSearchOrderBy;
}
