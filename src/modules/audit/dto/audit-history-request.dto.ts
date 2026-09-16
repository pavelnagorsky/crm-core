import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationRequestDto } from '../../../shared/dto/pagination-request.dto.js';
import { AuditEntity } from '../enums/audit-entity.enum.js';

export class AuditHistoryRequestDto extends PaginationRequestDto {
  @ApiProperty({ description: 'Entity ID to fetch audit history for' })
  @IsUUID()
  entityId: string;

  @ApiProperty({ enum: AuditEntity })
  @IsEnum(AuditEntity)
  entityType: AuditEntity;

  @ApiPropertyOptional({ description: 'Locale for rendered HTML (e.g. "ru")', default: 'ru' })
  @IsOptional()
  @IsString()
  lang?: string = 'ru';
}
