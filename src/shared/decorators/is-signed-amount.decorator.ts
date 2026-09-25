import { Matches } from 'class-validator';
import regularExpressions from '../regular-expressions.js';
import { CanonicalAmount } from '../transforms/canonical-amount.transform.js';
import { ApiSignedAmount } from './api-decimal.decorator.js';

const amountMatchMessage = (key: string | symbol) =>
  `${String(key)} must be an amount with at most 2 decimal places`;

export const IsSignedAmount =
  (): PropertyDecorator => (target, propertyKey) => {
    ApiSignedAmount()(target, propertyKey);
    CanonicalAmount()(target, propertyKey);
    Matches(regularExpressions.signedAmount, {
      message: amountMatchMessage(propertyKey),
    })(target, propertyKey);
  };
