import { registerDecorator, ValidationOptions } from 'class-validator';
import regularExpressions from '../../../shared/regular-expressions.js';

export function IsLocalDateTime(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyKey) => {
    registerDecorator({
      target: target.constructor,
      propertyName: propertyKey as string,
      options,
      constraints: [],
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' && regularExpressions.localDateTime.test(value),
        defaultMessage: () =>
          '$property must be a local datetime without timezone offset, e.g. 2026-09-20T10:00:00',
      },
    });
  };
}
