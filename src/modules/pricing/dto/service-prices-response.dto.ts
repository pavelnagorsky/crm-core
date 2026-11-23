import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { ServicePricesView } from '../interfaces/service-prices-view.interface.js';
import { ServiceLevelPriceResponseDto } from './service-level-price-response.dto.js';
import { ServiceStaffPriceResponseDto } from './service-staff-price-response.dto.js';

export class ServicePricesResponseDto {
  @ApiProperty({ type: String })
  serviceId: string;

  @ApiPrice()
  basePrice: string;

  @ApiPrice({
    description:
      'Lowest price over the active staff who perform the service; the base price without staff.',
  })
  priceFrom: string;

  @ApiPrice({
    description:
      'Highest price over the active staff who perform the service; the base price without staff.',
  })
  priceTo: string;

  @ApiProperty({ type: () => ServiceLevelPriceResponseDto, isArray: true })
  levels: ServiceLevelPriceResponseDto[];

  @ApiProperty({ type: () => ServiceStaffPriceResponseDto, isArray: true })
  staff: ServiceStaffPriceResponseDto[];

  static fromView(view: ServicePricesView): ServicePricesResponseDto {
    const dto = new ServicePricesResponseDto();
    dto.serviceId = view.serviceId;
    dto.basePrice = MoneyUtils.format(view.basePrice);
    dto.priceFrom = MoneyUtils.format(view.priceFrom);
    dto.priceTo = MoneyUtils.format(view.priceTo);
    dto.levels = view.levels.map(ServiceLevelPriceResponseDto.fromView);
    dto.staff = view.staff.map(ServiceStaffPriceResponseDto.fromView);
    return dto;
  }
}
