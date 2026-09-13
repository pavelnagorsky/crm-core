import { ApiProperty } from '@nestjs/swagger';

export abstract class PaginationResponseDto {
  abstract items: any[];

  @ApiProperty({ type: Number })
  page: number;

  @ApiProperty({ type: Number })
  totalItems: number;

  @ApiProperty({ type: Number })
  totalPages: number;

  protected constructor(
    requestedPage: number,
    pageSize: number,
    totalItems: number,
  ) {
    this.page = requestedPage;
    this.totalItems = totalItems;
    this.totalPages = Math.ceil(totalItems / pageSize);
  }
}
