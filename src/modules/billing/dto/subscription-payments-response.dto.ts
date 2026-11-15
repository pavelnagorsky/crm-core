import { ApiProperty } from '@nestjs/swagger';
import { PaginationResponseDto } from '../../../shared/dto/pagination-response.dto.js';
import { SubscriptionPaymentDto } from './subscription-payment.dto.js';

export class SubscriptionPaymentsResponseDto extends PaginationResponseDto {
  @ApiProperty({ type: () => SubscriptionPaymentDto, isArray: true })
  items: SubscriptionPaymentDto[];

  constructor(
    items: SubscriptionPaymentDto[],
    page: number,
    pageSize: number,
    totalItems: number,
    isExport = false,
  ) {
    super(page, pageSize, totalItems, isExport);
    this.items = items;
  }
}
