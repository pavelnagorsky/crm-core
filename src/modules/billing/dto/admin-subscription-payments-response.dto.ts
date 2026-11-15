import { ApiProperty } from '@nestjs/swagger';
import { PaginationResponseDto } from '../../../shared/dto/pagination-response.dto.js';
import { AdminSubscriptionPaymentDto } from './admin-subscription-payment.dto.js';

export class AdminSubscriptionPaymentsResponseDto extends PaginationResponseDto {
  @ApiProperty({ type: () => AdminSubscriptionPaymentDto, isArray: true })
  items: AdminSubscriptionPaymentDto[];

  constructor(
    items: AdminSubscriptionPaymentDto[],
    page: number,
    pageSize: number,
    totalItems: number,
    isExport = false,
  ) {
    super(page, pageSize, totalItems, isExport);
    this.items = items;
  }
}
