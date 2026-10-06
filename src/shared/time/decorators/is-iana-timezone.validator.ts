import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'isIanaTimezone', async: false })
export class IsIanaTimezoneConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    try {
      Intl.DateTimeFormat(undefined, { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }

  defaultMessage(): string {
    return '$property must be a valid IANA timezone (e.g. "Europe/Minsk", "UTC")';
  }
}

export function IsIanaTimezone(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyKey) => {
    registerDecorator({
      target: target.constructor,
      propertyName: propertyKey as string,
      options,
      constraints: [],
      validator: IsIanaTimezoneConstraint,
    });
  };
}
