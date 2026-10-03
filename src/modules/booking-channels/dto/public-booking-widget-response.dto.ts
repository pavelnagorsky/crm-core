import { ApiProperty } from '@nestjs/swagger';
import { BookingWidget } from '@prisma/client';
import { BusinessWithLogo } from '../../business/interfaces/business-with-logo.interface.js';
import { BusinessPublicResponseDto } from '../../business/dto/business-public-response.dto.js';
import { BookingSetupResponseDto } from '../../bookings/dto/booking-setup-response.dto.js';
import { resolveBookingFormTheme, toBookingFormConfig } from '../booking-form.js';
import { BookingFormConfigDto } from './booking-form-config.dto.js';
import { BookingFormThemeDto } from './booking-form-theme.dto.js';
import { PublicBookingWidgetDetailsDto } from './public-booking-widget-details.dto.js';

export class PublicBookingWidgetResponseDto {
  @ApiProperty({ type: () => BookingFormConfigDto })
  config: BookingFormConfigDto;

  @ApiProperty({ type: () => BookingFormThemeDto })
  theme: BookingFormThemeDto;

  @ApiProperty({ type: () => BusinessPublicResponseDto })
  business: BusinessPublicResponseDto;

  @ApiProperty({ type: () => BookingSetupResponseDto })
  setup: BookingSetupResponseDto;

  @ApiProperty({ type: () => PublicBookingWidgetDetailsDto })
  widget: PublicBookingWidgetDetailsDto;

  static from(
    widget: BookingWidget,
    business: BusinessWithLogo,
    setup: BookingSetupResponseDto,
  ): PublicBookingWidgetResponseDto {
    const dto = new PublicBookingWidgetResponseDto();
    dto.config = toBookingFormConfig(widget);
    dto.theme = resolveBookingFormTheme(widget);
    dto.business = BusinessPublicResponseDto.fromEntity(business);
    dto.setup = setup;
    dto.widget = PublicBookingWidgetDetailsDto.from(widget);
    return dto;
  }
}
