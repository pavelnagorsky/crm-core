import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';
import { PaginationRequestDto } from '../../../shared/dto/pagination-request.dto.js';
import { AuditEntity } from '../enums/audit-entity.enum.js';

export class AuditHistoryRequestDto extends PaginationRequestDto {
  @ApiProperty({ description: 'Entity ID to fetch audit history for' })
  @IsUUID()
  entityId: string;

  @ApiProperty({ enum: AuditEntity })
  @IsEnum(AuditEntity)
  entityType: AuditEntity;
}
