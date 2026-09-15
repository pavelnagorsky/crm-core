import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationRequestDto } from '../../../shared/dto/pagination-request.dto.js';
import { ClientSearchOrderBy } from '../enums/client-search-order-by.enum.js';

export class ClientSearchRequestDto extends PaginationRequestDto<ClientSearchOrderBy> {
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiProperty({ enum: ClientSearchOrderBy, required: false })
  @IsOptional()
  @IsEnum(ClientSearchOrderBy)
  declare orderBy?: ClientSearchOrderBy;
}
