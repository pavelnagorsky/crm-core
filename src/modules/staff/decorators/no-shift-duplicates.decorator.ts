import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

export function NoShiftDuplicates(options?: ValidationOptions) {
  return function (target: Function) {
    registerDecorator({
      name: 'noShiftDuplicates',
      target,
      propertyName: 'shifts',
      options: { message: 'Duplicate dates in shifts are not allowed', ...options },
      validator: {
        validate(_value: unknown, args: ValidationArguments) {
          const dto = args.object as { shifts?: { date: string }[] };
          if (!Array.isArray(dto.shifts)) return true;
          const dates = dto.shifts.map((s) => s.date);
          return dates.length === new Set(dates).size;
        },
      },
    });
  };
}
