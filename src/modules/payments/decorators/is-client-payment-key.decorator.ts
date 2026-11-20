import { registerDecorator, ValidationOptions } from 'class-validator';
import regularExpressions from '../../../shared/regular-expressions.js';

/**
 * A payment key chosen by the client. Keys starting with the prefixes of payments nested in
 * order operations (order-sale:, order-confirm:, order-return:) are reserved, so a client key
 * can never collide with the key of a nested payment.
 */
export function IsClientPaymentKey(
  options?: ValidationOptions,
): PropertyDecorator {
  return (target, propertyKey) => {
    registerDecorator({
      target: target.constructor,
      propertyName: propertyKey as string,
      options,
      constraints: [],
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' &&
          !regularExpressions.reservedPaymentKeyPrefix.test(value),
        defaultMessage: () =>
          '$property cannot start with order-sale:, order-confirm: or order-return:',
      },
    });
  };
}
