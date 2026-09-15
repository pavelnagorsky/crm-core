import { ApiProperty } from '@nestjs/swagger';
import { PaginationResponseDto } from '../../../shared/dto/pagination-response.dto.js';
import { ServiceResponseDto } from './service-response.dto.js';

export class ServiceSearchResponseDto extends PaginationResponseDto {
  @ApiProperty({ type: () => ServiceResponseDto, isArray: true })
  items: ServiceResponseDto[];

  constructor(
    items: ServiceResponseDto[],
    page: number,
    pageSize: number,
    totalItems: number,
    isExport: boolean = false,
  ) {
    super(page, pageSize, totalItems, isExport);
    this.items = items;
  }
}
