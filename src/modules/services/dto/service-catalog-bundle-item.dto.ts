import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { MoneyService } from '../../../shared/money/money.service.js';
import { BookingExecutionMode } from '../../bookings/enums/booking-execution-mode.enum.js';
import { BundlePricingMode } from '../enums/bundle-pricing-mode.enum.js';
import { ServiceCatalogKind } from '../enums/service-catalog-kind.enum.js';
import { ServiceCatalogBundleItem } from '../interfaces/service-catalog-bundle-item.interface.js';
import { ServiceCatalogItemBaseDto } from './service-catalog-item-base.dto.js';

export class ServiceCatalogBundleItemDto extends ServiceCatalogItemBaseDto {
  @ApiProperty({ enum: [ServiceCatalogKind.BUNDLE] })
  declare kind: ServiceCatalogKind.BUNDLE;

  @ApiProperty({ enum: BookingExecutionMode, enumName: 'BookingExecutionMode' })
  executionMode: BookingExecutionMode;

  @ApiProperty({ enum: BundlePricingMode, enumName: 'BundlePricingMode' })
  pricingMode: BundlePricingMode;

  @ApiPrice({ nullable: true })
  fixedPrice: string | null;

  @ApiProperty({ type: Number })
  itemsCount: number;

  @ApiProperty({ type: String, isArray: true })
  itemTitles: string[];

  static fromEntity(item: ServiceCatalogBundleItem): ServiceCatalogBundleItemDto {
    const dto = new ServiceCatalogBundleItemDto();
    ServiceCatalogItemBaseDto.assign(dto, item);
    dto.executionMode = item.executionMode;
    dto.pricingMode = item.pricingMode;
    dto.fixedPrice = item.fixedPrice == null ? null : MoneyService.format(item.fixedPrice);
    dto.itemsCount = item.itemsCount;
    dto.itemTitles = item.itemTitles;
    return dto;
  }
}
