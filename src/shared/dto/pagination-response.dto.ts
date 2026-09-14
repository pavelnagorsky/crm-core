import { ApiProperty } from '@nestjs/swagger';

export abstract class PaginationResponseDto {
  abstract items: any[];

  @ApiProperty({ type: Number })
  page: number;

  @ApiProperty({ type: Number })
  totalItems: number;

  @ApiProperty({ type: Number })
  totalPages: number;

  @ApiProperty({ type: Boolean })
  isExport: boolean;

  protected constructor(
    requestedPage: number,
    pageSize: number,
    totalItems: number,
    isExport: boolean = false,
  ) {
    this.page = requestedPage;
    this.totalItems = totalItems;
    this.totalPages = isExport ? 1 : Math.ceil(totalItems / pageSize);
    this.isExport = isExport;
  }
}
