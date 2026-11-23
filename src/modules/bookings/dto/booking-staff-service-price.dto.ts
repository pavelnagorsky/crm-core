import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { BookingStaffServicePrice } from '../interfaces/booking-staff-service-price.interface.js';

export class BookingStaffServicePriceDto {
  @ApiProperty({ type: String, format: 'uuid' })
  serviceId: string;

  @ApiPrice({
    description:
      'Lowest price of the service with this staff member over the online booking window, surcharges included',
  })
  priceFrom: string;

  @ApiPrice({
    description:
      'Highest price of the service with this staff member over the online booking window, surcharges included',
  })
  priceTo: string;

  static fromResult(
    item: BookingStaffServicePrice,
  ): BookingStaffServicePriceDto {
    return {
      serviceId: item.serviceId,
      priceFrom: MoneyUtils.format(item.priceFrom),
      priceTo: MoneyUtils.format(item.priceTo),
    };
  }
}
