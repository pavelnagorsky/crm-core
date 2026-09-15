import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

interface ShiftsRangeDto {
  from?: string;
  to?: string;
  shifts?: { date: string }[];
}

export function ShiftsWithinRange(options?: ValidationOptions) {
  return function (target: Function) {
    registerDecorator({
      name: 'shiftsWithinRange',
      target,
      propertyName: 'shifts',
      options: { message: 'All shift dates must be within [from, to]', ...options },
      validator: {
        validate(_value: unknown, args: ValidationArguments) {
          const dto = args.object as ShiftsRangeDto;
          if (!dto.from || !dto.to || !Array.isArray(dto.shifts)) return true;
          return dto.shifts.every((s) => s.date >= dto.from! && s.date <= dto.to!);
        },
      },
    });
  };
}
