import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { StaffServicePriceView } from '../interfaces/staff-service-price-view.interface.js';

export class StaffServicePriceResponseDto {
  @ApiProperty({ type: String })
  serviceId: string;

  @ApiProperty({ type: String })
  serviceTitle: string;

  @ApiPrice()
  basePrice: string;

  @ApiPrice({ description: 'Price by the level of the staff member.' })
  levelPrice: string;

  @ApiPrice({
    nullable: true,
    description: 'Personal price of the staff member.',
  })
  personalPrice: string | null;

  @ApiPrice({ description: 'Personal price, else the level price.' })
  price: string;

  static fromView(view: StaffServicePriceView): StaffServicePriceResponseDto {
    const dto = new StaffServicePriceResponseDto();
    dto.serviceId = view.serviceId;
    dto.serviceTitle = view.serviceTitle;
    dto.basePrice = MoneyUtils.format(view.basePrice);
    dto.levelPrice = MoneyUtils.format(view.levelPrice);
    dto.personalPrice =
      view.personalPrice === null
        ? null
        : MoneyUtils.format(view.personalPrice);
    dto.price = MoneyUtils.format(view.price);
    return dto;
  }
}
