import { ApiProperty } from '@nestjs/swagger';
import { PaginationResponseDto } from '../../../shared/dto/pagination-response.dto.js';
import { AccessMembershipResponseDto } from './access-membership-response.dto.js';
export class AccessMembershipSearchResponseDto extends PaginationResponseDto {
  @ApiProperty({ type: [AccessMembershipResponseDto] })
  items: AccessMembershipResponseDto[];
  @ApiProperty() version: number;
  constructor(
    items: AccessMembershipResponseDto[],
    page: number,
    pageSize: number,
    total: number,
    version: number,
    isExport = false,
  ) {
    super(page, pageSize, total, isExport);
    this.items = items;
    this.version = version;
  }
}
