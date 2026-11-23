import { ApiExtraModels, ApiProperty, getSchemaPath } from '@nestjs/swagger';
import { BookingServiceCatalog } from '../../services/catalog/interfaces/booking-service-catalog.interface.js';
import { BundleMetrics } from '../../services/utils/bundle-metrics.js';
import { BookingSetupPrices } from '../interfaces/booking-setup-prices.interface.js';
import { BookingSetupBundleDto } from './booking-setup-bundle.dto.js';
import { BookingSetupServiceDto } from './booking-setup-service.dto.js';

@ApiExtraModels(BookingSetupServiceDto, BookingSetupBundleDto)
export class BookingSetupCategoryDto {
  @ApiProperty({ type: String, nullable: true })
  id: string | null;

  @ApiProperty({ type: String, nullable: true })
  name: string | null;

  @ApiProperty({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({
    type: 'array',
    items: {
      oneOf: [
        { $ref: getSchemaPath(BookingSetupServiceDto) },
        { $ref: getSchemaPath(BookingSetupBundleDto) },
      ],
      discriminator: {
        propertyName: 'kind',
        mapping: {
          SERVICE: getSchemaPath(BookingSetupServiceDto),
          BUNDLE: getSchemaPath(BookingSetupBundleDto),
        },
      },
    },
  })
  services: Array<BookingSetupServiceDto | BookingSetupBundleDto>;

  static fromEntity(
    category: BookingServiceCatalog['categories'][number],
    prices: BookingSetupPrices,
  ): BookingSetupCategoryDto {
    return BookingSetupCategoryDto.build(
      category.id,
      category.name,
      category.description,
      category.services,
      category.bundles,
      prices,
    );
  }

  static uncategorized(
    services: BookingServiceCatalog['services'],
    bundles: BookingServiceCatalog['bundles'],
    prices: BookingSetupPrices,
  ): BookingSetupCategoryDto {
    return BookingSetupCategoryDto.build(
      null,
      null,
      null,
      services,
      bundles,
      prices,
    );
  }

  private static build(
    id: string | null,
    name: string | null,
    description: string | null,
    services: BookingServiceCatalog['services'],
    bundles: BookingServiceCatalog['bundles'],
    prices: BookingSetupPrices,
  ): BookingSetupCategoryDto {
    const dto = new BookingSetupCategoryDto();
    dto.id = id;
    dto.name = name;
    dto.description = description;
    dto.services = BookingSetupCategoryDto.ordered(services, bundles, prices);
    return dto;
  }

  private static ordered(
    services: BookingServiceCatalog['services'],
    bundles: BookingServiceCatalog['bundles'],
    prices: BookingSetupPrices,
  ): Array<BookingSetupServiceDto | BookingSetupBundleDto> {
    return [
      ...services.map((service) => ({
        sortOrder: service.sortOrder,
        title: service.title,
        id: service.id,
        item: BookingSetupServiceDto.fromEntity(
          service,
          prices.services.get(service.id) ?? {
            priceFrom: service.price,
            priceTo: service.price,
          },
        ),
      })),
      ...bundles.map((bundle) => ({
        sortOrder: bundle.sortOrder,
        title: bundle.title,
        id: bundle.id,
        item: BookingSetupBundleDto.fromEntity(
          bundle,
          prices.bundles.get(bundle.id) ?? {
            priceFrom: BundleMetrics.price(bundle),
            priceTo: BundleMetrics.price(bundle),
          },
        ),
      })),
    ]
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder ||
          left.title.localeCompare(right.title, 'ru') ||
          left.id.localeCompare(right.id),
      )
      .map((entry) => entry.item);
  }
}
