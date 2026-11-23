import { ApiProperty } from '@nestjs/swagger';
import { ApiPrice } from '../../../shared/decorators/api-decimal.decorator.js';
import { FileResponseDto } from '../../../shared/dto/file-response.dto.js';
import { MoneyUtils } from '../../../shared/money/money.utils.js';
import { BookingServiceCatalog } from '../../services/catalog/interfaces/booking-service-catalog.interface.js';
import { ServiceCatalogKind } from '../../services/enums/service-catalog-kind.enum.js';
import { BundleMetrics } from '../../services/utils/bundle-metrics.js';
import { BookingExecutionMode } from '../enums/booking-execution-mode.enum.js';
import { BookingPriceRange } from '../interfaces/booking-price-range.interface.js';

export class BookingSetupBundleDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ enum: [ServiceCatalogKind.BUNDLE] })
  kind: ServiceCatalogKind.BUNDLE;

  @ApiProperty({ type: String })
  title: string;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ type: String, nullable: true })
  categoryId: string | null;

  @ApiProperty({ type: () => FileResponseDto, nullable: true })
  image: FileResponseDto | null;

  @ApiPrice({
    description:
      'Package price of a FIXED bundle, the sum of the base prices of a SUM bundle',
  })
  price: string;

  @ApiPrice({
    description:
      'Lowest price over the online booking window, surcharges included. FIXED bundle: the package price range. SUM bundle: the sum of the lowest prices of its lines',
  })
  priceFrom: string;

  @ApiPrice({
    description:
      'Highest price over the online booking window, surcharges included. FIXED bundle: the package price range. SUM bundle: the sum of the highest prices of its lines',
  })
  priceTo: string;

  @ApiProperty({ type: Number })
  durationMinutes: number;

  @ApiProperty({ enum: BookingExecutionMode, enumName: 'BookingExecutionMode' })
  executionMode: BookingExecutionMode;

  @ApiProperty({ type: String, isArray: true })
  serviceIds: string[];

  static fromEntity(
    bundle: BookingServiceCatalog['bundles'][number],
    range: BookingPriceRange,
  ): BookingSetupBundleDto {
    const dto = new BookingSetupBundleDto();
    dto.id = bundle.id;
    dto.kind = ServiceCatalogKind.BUNDLE;
    dto.title = bundle.title;
    dto.description = bundle.description;
    dto.categoryId = bundle.categoryId;
    dto.image = bundle.imageFile
      ? FileResponseDto.fromEntity(bundle.imageFile)
      : null;
    dto.price = MoneyUtils.format(BundleMetrics.price(bundle));
    dto.priceFrom = MoneyUtils.format(range.priceFrom);
    dto.priceTo = MoneyUtils.format(range.priceTo);
    dto.durationMinutes = BundleMetrics.durationMinutes(bundle);
    dto.executionMode = bundle.executionMode as BookingExecutionMode;
    dto.serviceIds = bundle.items.map((item) => item.serviceId);
    return dto;
  }
}
