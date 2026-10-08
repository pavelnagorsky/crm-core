import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyService } from '../../../shared/money/money.service.js';
import { BookingPricingResult } from '../interfaces/booking-pricing-result.interface.js';
import { BookingPricingItemResponseDto } from './booking-pricing-item-response.dto.js';

export class BookingPricingResponseDto {
  @ApiProperty({ type: String })
  currency: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  bundleId: string | null;

  @ApiProperty({ type: String, nullable: true })
  bundleTitle: string | null;

  @ApiPrice()
  serviceTotal: string;

  @ApiPrice()
  productTotal: string;

  @ApiPrice()
  listTotalAmount: string;

  @ApiPrice()
  subtotalAmount: string;

  @ApiPrice()
  discountTotal: string;

  @ApiPrice()
  totalAmount: string;

  @ApiProperty({ type: () => BookingPricingItemResponseDto, isArray: true })
  items: BookingPricingItemResponseDto[];

  static fromResult(result: BookingPricingResult): BookingPricingResponseDto {
    return Object.assign(new BookingPricingResponseDto(), {
      currency: result.currency,
      bundleId: result.bundleId,
      bundleTitle: result.bundleTitle,
      serviceTotal: MoneyService.format(result.serviceTotal),
      productTotal: MoneyService.format(result.productTotal),
      listTotalAmount: MoneyService.format(result.listTotalAmount),
      subtotalAmount: MoneyService.format(result.subtotalAmount),
      discountTotal: MoneyService.format(result.discountTotal),
      totalAmount: MoneyService.format(result.totalAmount),
      items: result.items.map(BookingPricingItemResponseDto.fromLine),
    });
  }
}
