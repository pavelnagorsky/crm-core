import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationRequestDto } from '../../../shared/dto/pagination-request.dto.js';
import { ServiceCatalogKind } from '../enums/service-catalog-kind.enum.js';
import { ServiceSearchOrderBy } from '../enums/service-search-order-by.enum.js';
import { ServiceStatus } from '../enums/service-status.enum.js';

export class ServiceCatalogSearchRequestDto extends PaginationRequestDto<ServiceSearchOrderBy> {
  @ApiProperty({
    type: String,
    required: false,
    description: 'Title or description',
  })
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

  @ApiProperty({ enum: ServiceSearchOrderBy, enumName: 'ServiceSearchOrderBy', required: false })
  @IsOptional()
  @IsEnum(ServiceSearchOrderBy)
  declare orderBy?: ServiceSearchOrderBy;

  @ApiProperty({
    enum: ServiceCatalogKind,
    enumName: 'ServiceCatalogKind',
    required: false,
    description: 'Omit to return services and bundles together',
  })
  @IsOptional()
  @IsEnum(ServiceCatalogKind)
  kind?: ServiceCatalogKind;
}
