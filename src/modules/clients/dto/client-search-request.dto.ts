import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PaginationRequestDto } from '../../../shared/dto/pagination-request.dto.js';
import { ClientSearchOrderBy } from '../enums/client-search-order-by.enum.js';

export class ClientSearchRequestDto extends PaginationRequestDto<ClientSearchOrderBy> {
  @ApiProperty({ type: String, format: 'uuid' })
  @IsUUID()
  brandId: string;

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
