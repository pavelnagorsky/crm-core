import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import type { SaveBookingWidgetDto } from '../dto/save-booking-widget.dto.js';
import { BookingWidgetPlacement } from '../enums/booking-widget-placement.enum.js';
import { BookingWidgetTrigger } from '../enums/booking-widget-trigger.enum.js';

@ValidatorConstraint({ name: 'bookingWidgetButtonOffset', async: false })
export class BookingWidgetButtonOffsetConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as SaveBookingWidgetDto;
    if (
      dto.placement === BookingWidgetPlacement.INLINE ||
      dto.trigger !== BookingWidgetTrigger.FLOATING_BUTTON
    )
      return true;
    const offset = dto.buttonAppearance?.offset;
    return Number.isInteger(offset) && offset >= 8 && offset <= 64;
  }

  defaultMessage(): string {
    return 'buttonAppearance.offset must be an integer from 8 to 64 for a floating button';
  }
}
