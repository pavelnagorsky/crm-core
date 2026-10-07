import { ApiProperty } from '@nestjs/swagger';
import { PaginationResponseDto } from '../../../shared/dto/pagination-response.dto.js';
import { InventoryDocumentResponseDto } from './inventory-document-response.dto.js';

export class InventoryDocumentSearchResponseDto extends PaginationResponseDto {
  @ApiProperty({ type: () => InventoryDocumentResponseDto, isArray: true })
  items: InventoryDocumentResponseDto[];

  constructor(
    items: InventoryDocumentResponseDto[],
    page: number,
    pageSize: number,
    totalItems: number,
    isExport = false,
  ) {
    super(page, pageSize, totalItems, isExport);
    this.items = items;
  }
}
