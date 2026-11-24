import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { FileResponseDto } from '../../../shared/dto/file-response.dto.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { BookingServiceCatalog } from '../../services/catalog/interfaces/booking-service-catalog.interface.js';
import { ServiceCatalogKind } from '../../services/enums/service-catalog-kind.enum.js';
import { BookingPriceRange } from '../interfaces/booking-price-range.interface.js';
import { BookingPromotionLabelDto } from './booking-promotion-label.dto.js';

export class BookingSetupServiceDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ enum: [ServiceCatalogKind.SERVICE] })
  kind: ServiceCatalogKind.SERVICE;

  @ApiProperty({ type: String, nullable: true })
  categoryId: string | null;

  @ApiProperty({ type: String })
  title: string;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ type: () => FileResponseDto, nullable: true })
  image: FileResponseDto | null;

  @ApiPrice({ description: 'Base price of the service' })
  price: string;

  @ApiPrice({
    description:
      'Lowest price over the online booking window (location today and the advance window days), surcharges included, among the staff who perform the service; the base price over the window when nobody does',
  })
  priceFrom: string;

  @ApiPrice({
    description:
      'Highest price over the online booking window, surcharges included, among the staff who perform the service; the base price over the window when nobody does',
  })
  priceTo: string;

  @ApiProperty({ type: Number })
  durationMinutes: number;

  @ApiProperty({
    type: () => BookingPromotionLabelDto,
    nullable: true,
    description:
      'Label of the promotions that reach it (setup.promotions); null without any.',
  })
  promotion: BookingPromotionLabelDto | null;

  static fromEntity(
    service: BookingServiceCatalog['services'][number],
    range: BookingPriceRange,
  ): BookingSetupServiceDto {
    const dto = new BookingSetupServiceDto();
    dto.id = service.id;
    dto.kind = ServiceCatalogKind.SERVICE;
    dto.categoryId = service.categoryId;
    dto.title = service.title;
    dto.description = service.description;
    dto.image = service.imageFile
      ? FileResponseDto.fromEntity(service.imageFile)
      : null;
    dto.price = MoneyUtils.format(service.price);
    dto.priceFrom = MoneyUtils.format(range.priceFrom);
    dto.priceTo = MoneyUtils.format(range.priceTo);
    dto.promotion = BookingPromotionLabelDto.fromLabel(range.promotion);
    dto.durationMinutes = service.durationMinutes;
    return dto;
  }
}
