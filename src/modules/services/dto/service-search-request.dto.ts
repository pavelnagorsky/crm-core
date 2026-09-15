import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationRequestDto } from '../../../shared/dto/pagination-request.dto.js';
import { ServiceSearchOrderBy } from '../enums/service-search-order-by.enum.js';

export class ServiceSearchRequestDto extends PaginationRequestDto<ServiceSearchOrderBy> {
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiProperty({ type: Boolean, required: false })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isActive?: boolean;

  @ApiProperty({ enum: ServiceSearchOrderBy, required: false })
  @IsOptional()
  @IsEnum(ServiceSearchOrderBy)
  declare orderBy?: ServiceSearchOrderBy;
}
