import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

export function IsDateRangeValid(options?: ValidationOptions) {
  return function (target: Function) {
    registerDecorator({
      name: 'isDateRangeValid',
      target,
      propertyName: 'from',
      options: { message: 'from must be a valid date and not after to', ...options },
      validator: {
        validate(_value: unknown, args: ValidationArguments) {
          const dto = args.object as { from?: string; to?: string };
          if (!dto.from || !dto.to) return true;
          return dto.from <= dto.to;
        },
      },
    });
  };
}
