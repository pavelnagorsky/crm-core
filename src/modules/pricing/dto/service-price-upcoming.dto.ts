import { ApiProperty } from '@nestjs/swagger';
import { ServicePriceUpcomingView } from '../interfaces/service-price-upcoming-view.interface.js';
import { minorToApi } from '../rules/pricing-money.rules.js';
import { ServicePriceUpcomingBundleDto } from './service-price-upcoming-bundle.dto.js';
import { ServicePriceUpcomingNextDto } from './service-price-upcoming-next.dto.js';
import { ServicePriceUpcomingServiceDto } from './service-price-upcoming-service.dto.js';

export class ServicePriceUpcomingDto {
  @ApiProperty({ type: () => ServicePriceUpcomingNextDto, nullable: true })
  next: ServicePriceUpcomingNextDto | null;

  @ApiProperty({ type: () => ServicePriceUpcomingServiceDto, isArray: true })
  services: ServicePriceUpcomingServiceDto[];

  @ApiProperty({ type: () => ServicePriceUpcomingBundleDto, isArray: true })
  bundles: ServicePriceUpcomingBundleDto[];

  static fromView(view: ServicePriceUpcomingView): ServicePriceUpcomingDto {
    const dto = new ServicePriceUpcomingDto();
    dto.next = view.next;
    dto.services = view.services.map((item) => ({
      ...item,
      price: minorToApi(item.price),
    }));
    dto.bundles = view.bundles.map((item) => ({
      ...item,
      price: minorToApi(item.price),
    }));
    return dto;
  }
}
