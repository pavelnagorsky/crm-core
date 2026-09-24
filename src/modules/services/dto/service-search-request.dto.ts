import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationRequestDto } from '../../../shared/dto/pagination-request.dto.js';
import { ServiceSearchOrderBy } from '../enums/service-search-order-by.enum.js';
import { ServiceStatus } from '../enums/service-status.enum.js';

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

  @ApiProperty({ enum: ServiceStatus, enumName: 'ServiceStatus', required: false })
  @IsOptional()
  @IsEnum(ServiceStatus)
  status?: ServiceStatus;

  @ApiProperty({ enum: ServiceSearchOrderBy, required: false })
  @IsOptional()
  @IsEnum(ServiceSearchOrderBy)
  declare orderBy?: ServiceSearchOrderBy;
}
