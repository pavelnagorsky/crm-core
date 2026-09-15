import { ApiProperty } from '@nestjs/swagger';
import { PaginationResponseDto } from '../../../shared/dto/pagination-response.dto.js';
import { ClientResponseDto } from './client-response.dto.js';

export class ClientSearchResponseDto extends PaginationResponseDto {
  @ApiProperty({ type: () => ClientResponseDto, isArray: true })
  items: ClientResponseDto[];

  constructor(items: ClientResponseDto[], page: number, pageSize: number, totalItems: number, isExport = false) {
    super(page, pageSize, totalItems, isExport);
    this.items = items;
  }
}
