import { ApiProperty } from '@nestjs/swagger';
import { BookingWidget } from '@prisma/client';
import { LocationPublicProfile } from '../../location/interfaces/location-public-profile.interface.js';
import { LocationPublicResponseDto } from '../../location/dto/location-public-response.dto.js';
import { BookingSetupResponseDto } from '../../bookings/dto/booking-setup-response.dto.js';
import {
  resolveBookingFormTheme,
  toBookingFormConfig,
} from '../rendering/booking-form.js';
import { BookingFormConfigDto } from './booking-form-config.dto.js';
import { BookingFormThemeDto } from './booking-form-theme.dto.js';
import { PublicBookingWidgetDetailsDto } from './public-booking-widget-details.dto.js';

export class PublicBookingWidgetResponseDto {
  @ApiProperty({ type: () => BookingFormConfigDto })
  config: BookingFormConfigDto;

  @ApiProperty({ type: () => BookingFormThemeDto })
  theme: BookingFormThemeDto;

  @ApiProperty({ type: () => LocationPublicResponseDto })
  location: LocationPublicResponseDto;

  @ApiProperty({ type: () => BookingSetupResponseDto })
  setup: BookingSetupResponseDto;

  @ApiProperty({ type: () => PublicBookingWidgetDetailsDto })
  widget: PublicBookingWidgetDetailsDto;

  static from(
    widget: BookingWidget,
    location: LocationPublicProfile,
    setup: BookingSetupResponseDto,
  ): PublicBookingWidgetResponseDto {
    const dto = new PublicBookingWidgetResponseDto();
    dto.config = toBookingFormConfig(widget);
    dto.theme = resolveBookingFormTheme(widget);
    dto.location = LocationPublicResponseDto.fromEntity(location);
    dto.setup = setup;
    dto.widget = PublicBookingWidgetDetailsDto.from(widget);
    return dto;
  }
}
