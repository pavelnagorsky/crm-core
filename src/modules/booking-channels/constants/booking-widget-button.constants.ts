import { BookingWidgetButtonVariant } from '../enums/booking-widget-button-variant.enum.js';
import { BookingWidgetButtonFormat } from '../enums/booking-widget-button-format.enum.js';
import { BookingWidgetButtonSize } from '../enums/booking-widget-button-size.enum.js';
import { BookingWidgetButtonRadius } from '../enums/booking-widget-button-radius.enum.js';
import { BookingWidgetButtonIcon } from '../enums/booking-widget-button-icon.enum.js';
import type { BookingWidgetButtonAppearanceDto } from '../dto/booking-widget-button-appearance.dto.js';

export const DEFAULT_BOOKING_WIDGET_BUTTON_APPEARANCE = Object.freeze({
  text: 'Записаться',
  variant: BookingWidgetButtonVariant.SOLID,
  format: BookingWidgetButtonFormat.ICON_TEXT,
  size: BookingWidgetButtonSize.MEDIUM,
  radius: BookingWidgetButtonRadius.PILL,
  icon: BookingWidgetButtonIcon.CALENDAR,
  color: null,
  textColor: null,
  shadow: true,
  fullWidth: false,
  mobileIconOnly: true,
  offset: 24,
} satisfies BookingWidgetButtonAppearanceDto);
