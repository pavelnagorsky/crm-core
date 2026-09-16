import { ApiProperty } from '@nestjs/swagger';
import { PaginationResponseDto } from '../../../shared/dto/pagination-response.dto.js';
import { AuditLogItemDto } from './audit-log-item.dto.js';

export class AuditHistoryResponseDto extends PaginationResponseDto {
  @ApiProperty({ type: () => AuditLogItemDto, isArray: true })
  items: AuditLogItemDto[];

  constructor(items: AuditLogItemDto[], page: number, pageSize: number, totalItems: number) {
    super(page, pageSize, totalItems);
    this.items = items;
  }
}
