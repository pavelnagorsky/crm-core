import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ServiceCatalogKind } from '../enums/service-catalog-kind.enum.js';
import { ServiceStatus } from '../enums/service-status.enum.js';

export class ServiceCatalogCountsRequestDto {
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

  @ApiProperty({
    enum: ServiceCatalogKind,
    enumName: 'ServiceCatalogKind',
    required: false,
  })
  @IsOptional()
  @IsEnum(ServiceCatalogKind)
  kind?: ServiceCatalogKind;
}
