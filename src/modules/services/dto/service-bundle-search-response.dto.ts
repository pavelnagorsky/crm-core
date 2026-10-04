import { ApiProperty } from '@nestjs/swagger';
import { PaginationResponseDto } from '../../../shared/dto/pagination-response.dto.js';
import { ServiceBundleResponseDto } from './service-bundle-response.dto.js';

export class ServiceBundleSearchResponseDto extends PaginationResponseDto {
  @ApiProperty({ type: () => ServiceBundleResponseDto, isArray: true })
  items: ServiceBundleResponseDto[];

  constructor(
    items: ServiceBundleResponseDto[],
    page: number,
    pageSize: number,
    totalItems: number,
    isExport: boolean = false,
  ) {
    super(page, pageSize, totalItems, isExport);
    this.items = items;
  }
}
