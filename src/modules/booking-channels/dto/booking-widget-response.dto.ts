import { ApiProperty } from '@nestjs/swagger';
import { BookingWidget } from '@prisma/client';
import { BookingChannelStatus } from '../enums/booking-channel-status.enum.js';
import { BookingWidgetButtonPosition } from '../enums/booking-widget-button-position.enum.js';
import { BookingWidgetPlacement } from '../enums/booking-widget-placement.enum.js';
import { BookingWidgetTrigger } from '../enums/booking-widget-trigger.enum.js';
import { resolveBookingFormTheme, toBookingFormConfig } from '../booking-form.js';
import { BookingFormConfigDto } from './booking-form-config.dto.js';
import { BookingFormThemeDto } from './booking-form-theme.dto.js';

export class BookingWidgetResponseDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String })
  businessId: string;

  @ApiProperty({ type: String })
  title: string;

  @ApiProperty({ enum: BookingChannelStatus, enumName: 'BookingChannelStatus' })
  status: BookingChannelStatus;

  @ApiProperty({ type: () => BookingFormConfigDto })
  form: BookingFormConfigDto;

  @ApiProperty({ type: () => BookingFormThemeDto })
  theme: BookingFormThemeDto;

  @ApiProperty({ enum: BookingWidgetPlacement, enumName: 'BookingWidgetPlacement' })
  placement: BookingWidgetPlacement;

  @ApiProperty({ enum: BookingWidgetTrigger, enumName: 'BookingWidgetTrigger' })
  trigger: BookingWidgetTrigger;

  @ApiProperty({ enum: BookingWidgetButtonPosition, enumName: 'BookingWidgetButtonPosition' })
  buttonPosition: BookingWidgetButtonPosition;

  @ApiProperty({ type: [String] })
  allowedDomains: string[];

  @ApiProperty({ type: Date })
  createdAt: Date;

  @ApiProperty({ type: Date })
  updatedAt: Date;

  @ApiProperty({ type: Date, nullable: true })
  publishedAt: Date | null;

  static fromEntity(widget: BookingWidget): BookingWidgetResponseDto {
    const dto = new BookingWidgetResponseDto();
    dto.id = widget.id;
    dto.businessId = widget.businessId;
    dto.title = widget.title;
    dto.status = widget.status;
    dto.form = toBookingFormConfig(widget);
    dto.theme = resolveBookingFormTheme(widget);
    dto.placement = widget.placement;
    dto.trigger = widget.trigger;
    dto.buttonPosition = widget.buttonPosition;
    dto.allowedDomains = widget.allowedDomains;
    dto.createdAt = widget.createdAt;
    dto.updatedAt = widget.updatedAt;
    dto.publishedAt = widget.publishedAt;
    return dto;
  }
}
