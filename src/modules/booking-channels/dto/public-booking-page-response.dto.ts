import { ApiProperty } from '@nestjs/swagger';
import { BusinessWithLogo } from '../../business/interfaces/business-with-logo.interface.js';
import { BusinessPublicResponseDto } from '../../business/dto/business-public-response.dto.js';
import { BookingSetupResponseDto } from '../../bookings/dto/booking-setup-response.dto.js';
import { BookingPageWithCover } from '../interfaces/booking-page-with-cover.interface.js';
import { resolveBookingFormTheme, toBookingFormConfig } from '../booking-form.js';
import { BookingFormConfigDto } from './booking-form-config.dto.js';
import { BookingFormThemeDto } from './booking-form-theme.dto.js';
import { PublicBookingPageDetailsDto } from './public-booking-page-details.dto.js';

export class PublicBookingPageResponseDto {
  @ApiProperty({ type: () => BookingFormConfigDto })
  config: BookingFormConfigDto;

  @ApiProperty({ type: () => BookingFormThemeDto })
  theme: BookingFormThemeDto;

  @ApiProperty({ type: () => BusinessPublicResponseDto })
  business: BusinessPublicResponseDto;

  @ApiProperty({ type: () => BookingSetupResponseDto })
  setup: BookingSetupResponseDto;

  @ApiProperty({ type: () => PublicBookingPageDetailsDto })
  page: PublicBookingPageDetailsDto;

  static from(
    page: BookingPageWithCover,
    business: BusinessWithLogo,
    setup: BookingSetupResponseDto,
  ): PublicBookingPageResponseDto {
    const dto = new PublicBookingPageResponseDto();
    dto.config = toBookingFormConfig(page);
    dto.theme = resolveBookingFormTheme(page);
    dto.business = BusinessPublicResponseDto.fromEntity(business);
    dto.setup = setup;
    dto.page = PublicBookingPageDetailsDto.from(page);
    return dto;
  }
}
