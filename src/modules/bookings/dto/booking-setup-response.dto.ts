import { ApiProperty } from '@nestjs/swagger';
import { PublicProductCatalogDto } from '../../products/dto/public-product-catalog.dto.js';
import { ReviewStaffSummary } from '../../reviews/interfaces/review-staff-summary.interface.js';
import { BookingSetup } from '../interfaces/booking-setup.interface.js';
import { BookingSetupCategoryDto } from './booking-setup-category.dto.js';
import { BookingSetupStaffDto } from './booking-setup-staff.dto.js';

export class BookingSetupResponseDto {
  @ApiProperty({ type: () => BookingSetupCategoryDto, isArray: true })
  categories: BookingSetupCategoryDto[];

  @ApiProperty({ type: () => BookingSetupStaffDto, isArray: true })
  staff: BookingSetupStaffDto[];

  @ApiProperty({ type: () => PublicProductCatalogDto })
  products: PublicProductCatalogDto;

  @ApiProperty({
    description:
      'False while the brand subscription is blocked: show the page, but no booking form',
  })
  isOnlineBookingAvailable: boolean;

  @ApiProperty({
    description:
      'False when the location does not assign "any staff": the client must choose a staff member before a time',
  })
  anyStaffEnabled: boolean;

  static fromEntity(
    {
      catalog,
      staff,
      products,
      isOnlineBookingAvailable,
      anyStaffEnabled,
      prices,
    }: BookingSetup,
    staffReviewSummaries: ReadonlyMap<string, ReviewStaffSummary> = new Map(),
  ): BookingSetupResponseDto {
    const uncategorizedServices = catalog.services.filter(
      (service) => service.categoryId === null,
    );
    const uncategorizedBundles = catalog.bundles.filter(
      (bundle) => bundle.categoryId === null,
    );
    const dto = new BookingSetupResponseDto();
    dto.categories = catalog.categories.map((category) =>
      BookingSetupCategoryDto.fromEntity(category, prices),
    );
    if (uncategorizedServices.length || uncategorizedBundles.length) {
      dto.categories.push(
        BookingSetupCategoryDto.uncategorized(
          uncategorizedServices,
          uncategorizedBundles,
          prices,
        ),
      );
    }
    dto.staff = staff.map((member) =>
      BookingSetupStaffDto.fromEntity(
        member,
        staffReviewSummaries.get(member.id) ?? null,
        prices.staffServicePrices.get(member.id) ?? [],
      ),
    );
    dto.products = PublicProductCatalogDto.fromEntities(products);
    dto.isOnlineBookingAvailable = isOnlineBookingAvailable;
    dto.anyStaffEnabled = anyStaffEnabled;
    return dto;
  }
}
