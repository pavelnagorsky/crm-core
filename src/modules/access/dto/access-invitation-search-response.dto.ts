import { ApiProperty } from '@nestjs/swagger';
import { PaginationResponseDto } from '../../../shared/dto/pagination-response.dto.js';
import { AccessInvitationResponseDto } from './access-invitation-response.dto.js';
export class AccessInvitationSearchResponseDto extends PaginationResponseDto {
  @ApiProperty({ type: [AccessInvitationResponseDto] })
  items: AccessInvitationResponseDto[];
  constructor(
    items: AccessInvitationResponseDto[],
    page: number,
    pageSize: number,
    total: number,
    isExport = false,
  ) {
    super(page, pageSize, total, isExport);
    this.items = items;
  }
}
