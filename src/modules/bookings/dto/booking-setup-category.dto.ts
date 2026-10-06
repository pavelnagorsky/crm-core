import { ApiExtraModels, ApiProperty, getSchemaPath } from '@nestjs/swagger';
import {
  File,
  Service,
  ServiceBundle,
  ServiceBundleItem,
  ServiceCategory,
} from '@prisma/client';
import { BookingSetupBundleDto } from './booking-setup-bundle.dto.js';
import { BookingSetupServiceDto } from './booking-setup-service.dto.js';

type ServiceWithImage = Service & { imageFile: File | null };

type BundleWithItems = ServiceBundle & {
  imageFile: File | null;
  items: (ServiceBundleItem & { service: Service })[];
};

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
    category: ServiceCategory & {
      services: ServiceWithImage[];
      bundles: BundleWithItems[];
    },
  ): BookingSetupCategoryDto {
    return BookingSetupCategoryDto.build(
      category.id,
      category.name,
      category.description,
      category.services,
      category.bundles,
    );
  }

  static uncategorized(
    services: ServiceWithImage[],
    bundles: BundleWithItems[],
  ): BookingSetupCategoryDto {
    return BookingSetupCategoryDto.build(null, null, null, services, bundles);
  }

  private static build(
    id: string | null,
    name: string | null,
    description: string | null,
    services: ServiceWithImage[],
    bundles: BundleWithItems[],
  ): BookingSetupCategoryDto {
    const dto = new BookingSetupCategoryDto();
    dto.id = id;
    dto.name = name;
    dto.description = description;
    dto.services = BookingSetupCategoryDto.ordered(services, bundles);
    return dto;
  }

  private static ordered(
    services: ServiceWithImage[],
    bundles: BundleWithItems[],
  ): Array<BookingSetupServiceDto | BookingSetupBundleDto> {
    return [
      ...services.map((service) => ({
        sortOrder: service.sortOrder,
        title: service.title,
        id: service.id,
        item: BookingSetupServiceDto.fromEntity(service),
      })),
      ...bundles.map((bundle) => ({
        sortOrder: bundle.sortOrder,
        title: bundle.title,
        id: bundle.id,
        item: BookingSetupBundleDto.fromEntity(bundle),
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
