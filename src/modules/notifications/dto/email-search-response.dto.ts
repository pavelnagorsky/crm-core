import { ApiProperty } from '@nestjs/swagger';
import { PaginationResponseDto } from '../../../shared/dto/pagination-response.dto.js';
import { EmailMessageDto } from './email-message.dto.js';

export class EmailSearchResponseDto extends PaginationResponseDto {
  @ApiProperty({ type: () => EmailMessageDto, isArray: true })
  items: EmailMessageDto[];

  constructor(
    items: EmailMessageDto[],
    page: number,
    pageSize: number,
    totalItems: number,
    isExport = false,
  ) {
    super(page, pageSize, totalItems, isExport);
    this.items = items;
  }
}
