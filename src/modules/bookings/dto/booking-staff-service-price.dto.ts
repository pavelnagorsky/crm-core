import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { BookingStaffServicePrice } from '../interfaces/booking-staff-service-price.interface.js';

export class BookingStaffServicePriceDto {
  @ApiProperty({ type: String, format: 'uuid' })
  serviceId: string;

  @ApiPrice()
  price: string;

  static fromResult(
    item: BookingStaffServicePrice,
  ): BookingStaffServicePriceDto {
    return { serviceId: item.serviceId, price: MoneyUtils.format(item.price) };
  }
}
