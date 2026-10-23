import { ApiProperty } from '@nestjs/swagger';
import { PublicProductCatalogDto } from '../../products/dto/public-product-catalog.dto.js';
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

  static fromEntity({
    catalog,
    staff,
    products,
  }: BookingSetup): BookingSetupResponseDto {
    const uncategorizedServices = catalog.services.filter(
      (service) => service.categoryId === null,
    );
    const uncategorizedBundles = catalog.bundles.filter(
      (bundle) => bundle.categoryId === null,
    );
    const dto = new BookingSetupResponseDto();
    dto.categories = catalog.categories.map(BookingSetupCategoryDto.fromEntity);
    if (uncategorizedServices.length || uncategorizedBundles.length) {
      dto.categories.push(
        BookingSetupCategoryDto.uncategorized(
          uncategorizedServices,
          uncategorizedBundles,
        ),
      );
    }
    dto.staff = staff.map(BookingSetupStaffDto.fromEntity);
    dto.products = PublicProductCatalogDto.fromEntities(products);
    return dto;
  }
}
