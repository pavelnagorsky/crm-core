import { normalizeBookingWidgetTrigger } from '../rules/booking-widget-trigger.js';
import { ApiProperty } from '@nestjs/swagger';
import { BookingWidget } from '@prisma/client';
import { BookingWidgetButtonPosition } from '../enums/booking-widget-button-position.enum.js';
import { BookingWidgetPlacement } from '../enums/booking-widget-placement.enum.js';
import { BookingWidgetTrigger } from '../enums/booking-widget-trigger.enum.js';
import { BookingWidgetButtonAppearanceDto } from './booking-widget-button-appearance.dto.js';

export class PublicBookingWidgetDetailsDto {
  @ApiProperty({ type: String })
  id: string;

  @ApiProperty({ type: String, nullable: true, example: 'GTM-ABC1234' })
  gtmId: string | null;

  @ApiProperty({ type: String, nullable: true, example: '12345678' })
  yandexMetrikaId: string | null;

  @ApiProperty({
    enum: BookingWidgetPlacement,
    enumName: 'BookingWidgetPlacement',
  })
  placement: BookingWidgetPlacement;

  @ApiProperty({ enum: BookingWidgetTrigger, enumName: 'BookingWidgetTrigger' })
  trigger: BookingWidgetTrigger;

  @ApiProperty({
    enum: BookingWidgetButtonPosition,
    enumName: 'BookingWidgetButtonPosition',
  })
  buttonPosition: BookingWidgetButtonPosition;

  @ApiProperty({ type: () => BookingWidgetButtonAppearanceDto })
  buttonAppearance: BookingWidgetButtonAppearanceDto;

  static from(widget: BookingWidget): PublicBookingWidgetDetailsDto {
    const dto = new PublicBookingWidgetDetailsDto();
    dto.id = widget.id;
    dto.gtmId = widget.gtmId;
    dto.yandexMetrikaId = widget.yandexMetrikaId;
    dto.placement = widget.placement;
    dto.trigger = normalizeBookingWidgetTrigger(
      widget.placement,
      widget.trigger,
    );
    dto.buttonPosition = widget.buttonPosition;
    dto.buttonAppearance = BookingWidgetButtonAppearanceDto.fromStored(
      widget.buttonAppearance,
    );
    return dto;
  }
}
