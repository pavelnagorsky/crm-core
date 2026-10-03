import { ValidationArguments, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';
import { BookingPalette } from '../enums/booking-palette.enum.js';

@ValidatorConstraint({ name: 'bookingFormPalette', async: false })
export class BookingFormPaletteConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as { paletteId?: BookingPalette; customPalette?: unknown };
    if (dto.paletteId === BookingPalette.CUSTOM) {
      return dto.customPalette != null && typeof dto.customPalette === 'object' && !Array.isArray(dto.customPalette);
    }
    return dto.customPalette === null;
  }

  defaultMessage(): string {
    return 'customPalette is required when paletteId is CUSTOM and must be null otherwise';
  }
}
