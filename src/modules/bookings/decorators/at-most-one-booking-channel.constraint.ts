import { ValidationArguments, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';

@ValidatorConstraint({ name: 'atMostOneBookingChannel', async: false })
export class AtMostOneBookingChannelConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const dto = args.object as { bookingPageId?: string; bookingWidgetId?: string };
    return !(dto.bookingPageId && dto.bookingWidgetId);
  }

  defaultMessage(): string {
    return 'Set either bookingPageId or bookingWidgetId, not both';
  }
}
