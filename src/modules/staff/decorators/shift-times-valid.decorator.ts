import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

export function ShiftTimesValid(options?: ValidationOptions) {
  return function (target: Function) {
    registerDecorator({
      name: 'shiftTimesValid',
      target,
      propertyName: 'shifts',
      options: {
        message: 'startTime must be before endTime for every shift',
        ...options,
      },
      validator: {
        validate(_value: unknown, args: ValidationArguments) {
          const dto = args.object as {
            shifts?: { startTime: string; endTime: string }[];
          };
          if (!Array.isArray(dto.shifts)) return true;
          return dto.shifts.every((s) => s.startTime < s.endTime);
        },
      },
    });
  };
}
