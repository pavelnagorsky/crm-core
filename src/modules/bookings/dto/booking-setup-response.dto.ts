import { ApiProperty } from '@nestjs/swagger';
import { BookingSetupCategoryDto } from './booking-setup-category.dto.js';
import { BookingSetupStaffDto } from './booking-setup-staff.dto.js';
import { BookingSetupBundleDto } from './booking-setup-bundle.dto.js';

export class BookingSetupResponseDto {
  @ApiProperty({ type: () => BookingSetupCategoryDto, isArray: true })
  categories: BookingSetupCategoryDto[];

  @ApiProperty({ type: () => BookingSetupStaffDto, isArray: true })
  staff: BookingSetupStaffDto[];

  @ApiProperty({ type: () => BookingSetupBundleDto, isArray: true })
  bundles: BookingSetupBundleDto[];
}
